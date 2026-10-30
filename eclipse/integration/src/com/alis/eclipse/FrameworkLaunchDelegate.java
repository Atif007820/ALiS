package com.alis.eclipse;

import java.io.File;
import java.util.ArrayList;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.eclipse.core.resources.IProject;
import org.eclipse.core.resources.ResourcesPlugin;
import org.eclipse.core.runtime.CoreException;
import org.eclipse.core.runtime.IPath;
import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.core.runtime.Platform;
import org.eclipse.core.runtime.Status;
import org.eclipse.debug.core.DebugPlugin;
import org.eclipse.debug.core.ILaunch;
import org.eclipse.debug.core.ILaunchConfiguration;
import org.eclipse.debug.core.ILaunchConfigurationWorkingCopy;
import org.eclipse.debug.core.ILaunchManager;
import org.eclipse.debug.core.model.ILaunchConfigurationDelegate;
import org.osgi.framework.Bundle;

public final class FrameworkLaunchDelegate implements ILaunchConfigurationDelegate {
    private static final String PARAMETERS = "org.eclipse.lsp4e.debug.model.ATTR_DSP_PARAM";
    private static final Pattern ENVIRONMENT_VARIABLE = Pattern.compile("\\$\\{env_var:([^}]+)}");
    private static final Pattern WORKSPACE_VARIABLE = Pattern.compile("\\$\\{workspace_loc:/([^}]+)}");

    @Override
    public void launch(ILaunchConfiguration configuration, String mode, ILaunch launch,
            IProgressMonitor monitor) throws CoreException {
        JsonObject parameters = JsonParser.parseString(configuration.getAttribute(PARAMETERS, "{}")).getAsJsonObject();
        if (ILaunchManager.RUN_MODE.equals(mode)) {
            launchAsPlainProcess(configuration, parameters, launch);
            return;
        }
        if (!ILaunchManager.DEBUG_MODE.equals(mode)) {
            throw new CoreException(Status.error("Unsupported ALiS launch mode: " + mode));
        }

        JsonObject environment = parameters.has("env") ? parameters.getAsJsonObject("env") : new JsonObject();
        environment.addProperty("ALIS_ECLIPSE_MODE", ILaunchManager.DEBUG_MODE);
        environment.addProperty("HEADLESS", "false");
        parameters.add("env", environment);
        addModeArgument(parameters, ILaunchManager.DEBUG_MODE);

        ILaunchConfigurationWorkingCopy effective = configuration.getWorkingCopy();
        effective.setAttribute(PARAMETERS, parameters.toString());

        Bundle debugger = Platform.getBundle("org.eclipse.wildwebdeveloper");
        if (debugger == null) {
            throw new CoreException(Status.error("Wild Web Developer is required for ALiS Node.js launches."));
        }
        try {
            ILaunchConfigurationDelegate delegate = (ILaunchConfigurationDelegate) debugger
                    .loadClass("org.eclipse.wildwebdeveloper.debug.node.NodeRunDAPDebugDelegate")
                    .getConstructor().newInstance();
            delegate.launch(effective, mode, launch, monitor);
        } catch (ReflectiveOperationException exception) {
            throw new CoreException(Status.error("Cannot load Eclipse's Node.js launcher. Check Wild Web Developer installation.", exception));
        }
    }

    private static void launchAsPlainProcess(ILaunchConfiguration configuration, JsonObject parameters,
            ILaunch launch) throws CoreException {
        String runtime = substitute(stringValue(parameters, "runtimeExecutable", "node"));
        String program = substitute(configuration.getAttribute("program", ""));
        String workingDirectory = substitute(configuration.getAttribute(DebugPlugin.ATTR_WORKING_DIRECTORY, ""));
        ArrayList<String> command = new ArrayList<>();
        command.add(runtime);
        command.add(program);
        addArguments(command, parameters);

        String[] configuredEnvironment = DebugPlugin.getDefault().getLaunchManager().getEnvironment(configuration);
        Map<String, String> environment = LaunchEnvironment.resolve(configuredEnvironment, System.getenv());
        if (configuredEnvironment != null) {
            for (Map.Entry<String, String> entry : environment.entrySet()) {
                entry.setValue(substitute(entry.getValue()));
            }
        }
        if (parameters.has("env") && parameters.get("env").isJsonObject()) {
            for (Map.Entry<String, JsonElement> entry : parameters.getAsJsonObject("env").entrySet()) {
                environment.put(entry.getKey(), substitute(entry.getValue().getAsString()));
            }
        }
        environment.put("ALIS_ECLIPSE_MODE", ILaunchManager.RUN_MODE);

        Process process = DebugPlugin.exec(command.toArray(String[]::new), new File(workingDirectory),
                environment.entrySet().stream().map(entry -> entry.getKey() + "=" + entry.getValue()).toArray(String[]::new));
        DebugPlugin.newProcess(launch, process, configuration.getName() + " (Run)");
    }

    private static void addArguments(ArrayList<String> command, JsonObject parameters) throws CoreException {
        if (parameters.has("args") && parameters.get("args").isJsonArray()) {
            for (JsonElement argument : parameters.getAsJsonArray("args")) {
                command.add(substitute(argument.getAsString()));
            }
        }
        command.add("--eclipse-mode=run");
    }

    private static void addModeArgument(JsonObject parameters, String mode) {
        JsonArray args = parameters.has("args") && parameters.get("args").isJsonArray()
                ? parameters.getAsJsonArray("args") : new JsonArray();
        JsonArray updated = new JsonArray();
        for (JsonElement argument : args) {
            if (!argument.getAsString().startsWith("--eclipse-mode=")) updated.add(argument);
        }
        updated.add("--eclipse-mode=" + mode);
        parameters.add("args", updated);
    }

    private static String stringValue(JsonObject object, String key, String fallback) {
        return object.has(key) && !object.get(key).isJsonNull() ? object.get(key).getAsString() : fallback;
    }

    private static String substitute(String value) throws CoreException {
        Matcher environmentMatcher = ENVIRONMENT_VARIABLE.matcher(value);
        StringBuffer expanded = new StringBuffer();
        while (environmentMatcher.find()) {
            String requestedName = environmentMatcher.group(1);
            String resolved = System.getenv(requestedName);
            if (resolved == null) {
                resolved = System.getenv().entrySet().stream()
                        .filter(entry -> entry.getKey().equalsIgnoreCase(requestedName))
                        .map(Map.Entry::getValue)
                        .findFirst()
                        .orElse(null);
            }
            if (resolved == null) throw new CoreException(Status.error("Environment variable is not set: " + requestedName));
            environmentMatcher.appendReplacement(expanded, Matcher.quoteReplacement(resolved));
        }
        environmentMatcher.appendTail(expanded);

        Matcher workspaceMatcher = WORKSPACE_VARIABLE.matcher(expanded.toString());
        StringBuffer resolved = new StringBuffer();
        while (workspaceMatcher.find()) {
            String variablePath = workspaceMatcher.group(1).replace('\\', '/');
            int separator = variablePath.indexOf('/');
            String projectName = separator < 0 ? variablePath : variablePath.substring(0, separator);
            String relativePath = separator < 0 ? "" : variablePath.substring(separator + 1);
            IProject project = ResourcesPlugin.getWorkspace().getRoot().getProject(projectName);
            IPath location = project.exists() ? project.getLocation() : null;
            if (location == null) throw new CoreException(Status.error("Workspace project has no location: " + projectName));
            if (!relativePath.isEmpty()) location = location.append(relativePath);
            workspaceMatcher.appendReplacement(resolved, Matcher.quoteReplacement(location.toOSString()));
        }
        workspaceMatcher.appendTail(resolved);
        return resolved.toString();
    }

}
