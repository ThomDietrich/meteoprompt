// Vitest global setup — runs before every test file.
//
// Pin the process timezone to Europe/Berlin so the `toLocale*`-based helpers
// (`dayKey`, `deDateTime`, `dayLengthHours`, the DE number/date formatting) are
// deterministic regardless of where the suite runs. The Docker container already
// exports TZ=Europe/Berlin (see docker-compose.yaml); setting it here makes the
// test suite self-contained and reproducible on any host too.
process.env.TZ = "Europe/Berlin";
