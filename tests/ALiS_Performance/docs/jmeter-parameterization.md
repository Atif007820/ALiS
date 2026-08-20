# JMeter Load Profiles

Default behavior:

```powershell
npm run perf -- --script=LNI_PREPROD.jmx
```

This runs the `.jmx` exactly as it is saved in JMeter. Thread counts, ramp-up, loops, duration, URLs, timeouts, and other settings come from the script itself.

Optional load profile behavior:

```powershell
npm run perf -- --script=LNI_PREPROD.jmx --profile=smoke
```

When `--profile` is supplied, the framework passes these properties to JMeter:

```text
threads
rampUp
duration
loops
```

You can also override profile values from the command line:

```powershell
npm run perf -- --script=LNI_PREPROD.jmx --profile=smoke --threads=5 --duration=60
```

Custom JMeter properties can be passed with the `--J.` prefix:

```powershell
npm run perf -- --script=LNI_PREPROD.jmx --J.timeout=60000 --J.someFlag=true
```

Inside JMeter, reference values with standard property functions, for example:

```text
${__P(threads,1)}
${__P(duration,30)}
```

No existing JMX script has been modified by the framework creation.
