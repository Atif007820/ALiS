package com.alis.eclipse;

import java.util.Map;

public final class LaunchEnvironmentTest {
    public static void main(String[] args) {
        Map<String, String> parent = Map.of("ProgramFiles", "C:\\Program Files",
                "LOCALAPPDATA", "C:\\Users\\Demo\\AppData\\Local", "USERPROFILE", "C:\\Users\\Demo",
                "SystemRoot", "C:\\Windows", "TEMP", "C:\\Temp", "Path", "parent-path");
        Map<String, String> inherited = LaunchEnvironment.resolve(null, parent);
        if (!inherited.equals(parent)) throw new AssertionError("Default launches must inherit all Windows variables");
        inherited.put("PATH", "override-path");
        if (inherited.size() != parent.size()) throw new AssertionError("Windows variable names must be case-insensitive");
        if (!"parent-path".equals(parent.get("Path"))) throw new AssertionError("Parent environment must not be mutated");
        Map<String, String> explicit = LaunchEnvironment.resolve(new String[] { "Path=custom", "VALUE=a=b" }, parent);
        if (explicit.containsKey("USERPROFILE")) throw new AssertionError("Respect explicit environment replacement");
        if (!"a=b".equals(explicit.get("value"))) throw new AssertionError("Preserve equals signs in values");
        if (!LaunchEnvironment.resolve(new String[0], parent).isEmpty()) throw new AssertionError("Respect empty replacement");
        System.out.println("Launch environment regression checks passed (inheritance, overrides, isolation, replacement).");
    }
}
