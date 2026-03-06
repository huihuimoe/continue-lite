const fs = require("fs");
const path = require("path");

function writeBuildTimestamp() {
  fs.writeFileSync(
    path.join(__dirname, "..", "src", ".buildTimestamp.ts"),
    `export default "${new Date().toISOString()}";\n`,
  );
}

module.exports = { writeBuildTimestamp };

if (require.main === module) {
  writeBuildTimestamp();
}
