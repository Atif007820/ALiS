package com.alis.eclipse;

import java.util.Map;
import java.util.TreeMap;

final class LaunchEnvironment {
    private LaunchEnvironment() {}

    static Map<String, String> resolve(String[] configured, Map<String, String> inherited) {
        Map<String, String> environment = new TreeMap<>(String.CASE_INSENSITIVE_ORDER);
        // Eclipse returns null when the launch should inherit its parent's environment.
        if (configured == null) {
            environment.putAll(inherited);
        } else {
            for (String entry : configured) {
                int separator = entry.indexOf('=');
                if (separator > 0) environment.put(entry.substring(0, separator), entry.substring(separator + 1));
            }
        }
        return environment;
    }
}
