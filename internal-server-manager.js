const { fork } = require('child_process');
const path = require('path');


const INTERNAL_SERVER_SCRIPT = path.join(__dirname, 'internal-server.js');


class InternalServer {
    constructor(port) {
        this.port = port;
        this.child = null;
    }

    // start the internal server
    startServer() {
        return new Promise((resolve, reject) => {
            if(this.child && !this.child.killed) {
                console.log(`[internal-server-manager] Internal server already running on port ${this.port}`);
                return resolve(); // resolve the Promise
            }
            
            console.log(`[internal-server-manager] Starting on port ${this.port}`);
            this.child = fork(INTERNAL_SERVER_SCRIPT, [this.port], {
                silent: false, // show the output of the interal server inside the terminal
                detatched: false // if the parent exists, the child automaitcally terminate
            });

            const onMessage = (msg) => {
                if(msg === 'ready') {
                    console.log(`[internal-server-manager] Ready on port ${this.port}`);
                    this.child.off('message', onMessage); // once the server is ready, removes the 'message' listener to avoid that the Promise resolves multiple times
                    resolve();
                }
            };
            this.child.on('message', onMessage);
            this.child.on('error', reject); // the Promise is rejected if the process doesn't spown
            this.child.on('exit', () => this.cleanupServer()); // if the child dies we call automatically the cleanup procedure

            // Timeout
            const timeout = setTimeout(() => {
                this.child.kill();
                reject(new Error(`Internal server did not become ready within 5s. Abort`));
            }, 5000);

            // Clear timeout on resolve
            const originalResolve = resolve; // references to the Promise resolution functino
            resolve = (value) => { // reassign the variable 'resolve'
                clearTimeout(timeout);
                originalResolve(value); // invoke the function to resolve the Promise
            };
        });
    }

    // stop the internal server
    stopServer() {
        return new Promise((resolve) => {
            if (!this.child || this.child.killed) {
                this.cleanupServer();
                return resolve();
            }
            this.child.kill();
            this.child.on('exit', () => {
                this.cleanupServer();
                resolve();
            });
        });
    }

    // free resourses after the internal server stops/crush
    cleanupServer() {
        if (this.child) this.child.removeAllListeners();
        this.child = null;
    }
}


module.exports = InternalServer;