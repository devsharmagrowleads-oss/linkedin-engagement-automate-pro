function timestamp() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

function info(msg) {
  console.log(`[${timestamp()}] INFO  ${msg}`);
}

function warn(msg) {
  console.log(`[${timestamp()}] WARN  ${msg}`);
}

function error(msg) {
  console.error(`[${timestamp()}] ERROR ${msg}`);
}

function success(msg) {
  console.log(`[${timestamp()}] OK    ${msg}`);
}

module.exports = { info, warn, error, success };
