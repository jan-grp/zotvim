// Run node:test in one process so the suite also works in restricted shells
// that do not support the test runner's child-process IPC.
require("./keys.test.cjs");
require("./window.test.cjs");
require("./reader.test.cjs");
