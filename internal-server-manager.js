const { fork } = require('child_process');
const path = require('path');



const INTERNAL_SERVER_SCRIPT = path.join(__dirname, 'internal-server.js');



class InternalServer {
    constructor(port) {
        this.port = port;
        this.child = null;
        this.starting = false;      // prevent concurrent start attempts
        this.stopping = false;      // prevent concurrent stop attempts
    }


    startServer() {
        return new Promise((resolve, reject) => {
            // If already running, resolve immediately
            if (this.child && !this.child.killed) {
                console.log(`[internal-server-manager] Already running on port ${this.port}`);
                return resolve();
            }

            // Prevent multiple simultaneous start attempts
            if (this.starting) {
                return reject(new Error('Server start already in progress'));
            }
            this.starting = true;

            console.log(`[internal-server-manager] Starting on port ${this.port}`);
            const child = fork(INTERNAL_SERVER_SCRIPT, [String(this.port)], {
                silent: false, // output of the child process will appear in the parent's terminal 
                detached: false // the child will exit automatically when the parent's exits 
            });

            let settled = false; // ensures the Promise will be rejected or resolved only once
            // If the child does not become 'ready' within 5 seconds, the timeout triggers:
            // - kill the child process
            // - rejects the Promise
            // - clears the 'starting' flag
            const timeout = setTimeout(() => {
                if (!settled) {
                    settled = true;
                    this.starting = false;
                    child.kill('SIGTERM');
                    reject(new Error(`Internal server did not become ready within 5s on port ${this.port}`));
                }
            }, 5000);

            // Removes the event listeners that were attached to this specific child
            const cleanupChildRef = () => {
                child.off('message', onMessage);
                child.off('error', onError);
                child.off('exit', onExit);
            };

            // event handler
            // When the child signals 'ready':
            // - Mark as settled
            // - Clear the timeout
            // - Remove all event listeners from the child
            // - Assign this.child = child: ensure that only a fully ready server is considered 'running'
            // - Resolve the Promise
            const onMessage = (msg) => {
                if (msg === 'ready' && !settled) {
                    settled = true;
                    this.starting = false;
                    clearTimeout(timeout);
                    cleanupChildRef();
                    this.child = child;
                    resolve();
                }
            };

            // Triggers if the process fails to spawn. Rejects the promise
            const onError = (err) => {
                if (!settled) {
                    settled = true;
                    this.starting = false;
                    clearTimeout(timeout);
                    cleanupChildRef();
                    reject(err);
                }
            };

            const onExit = (code, signal) => {
                if (!settled) {
                    // Process died before sending 'ready'
                    settled = true;
                    this.starting = false;
                    clearTimeout(timeout);
                    cleanupChildRef();
                    reject(new Error(`Child process exited with code ${code}, signal ${signal} before becoming ready`));
                } else {
                    // Process died after it was already ready – auto cleanup
                    this.cleanupServer();
                }
            };

            // All listeners are attached to the local 'child' variable, so they are guaranteed to refer to the correct process
            // even if this.child changes later.
            child.on('message', onMessage);
            child.on('error', onError);
            child.on('exit', onExit);
        });
    }


    stopServer() {
        return new Promise((resolve) => {
            // idempotent: already stopping, assume success
            if (this.stopping) {
                return resolve();
            }

            // If no child or child is dead
            if (!this.child || this.child.killed) {
                this.cleanupServer();
                return resolve();
            }

            // Prevents concurrent stopServer() calls
            this.stopping = true;
            const child = this.child;  // capture reference in case this.child changes during the stop process

            // termination process:
            // - tell the process is no longer stopping
            // - call the cleanup method
            // - resolve the Promise
            const onExit = () => {
                this.stopping = false;
                this.cleanupServer();  // sets this.child = null and removes listeners
                resolve();
            };

            // Ensures we know when the process actually terminates
            child.once('exit', onExit);
            // Asks the child to shut down gracefully
            child.kill('SIGTERM');

            // Safety timeout: if child refuses to exit, force cleanup after 2s
            const timeout = setTimeout(() => {
                if (this.child === child && !child.killed) {
                    child.kill('SIGKILL');
                }
                // Resolve anyway after forceful kill
                onExit();
                clearTimeout(timeout);
            }, 2000);
        });
    }


    // Free the resources:
    // - Removes all listeners 
    // - Nullifies the reference
    // - Reset starting and stopping flags
    cleanupServer() {
        if (this.child) {
            this.child.removeAllListeners();
            this.child = null;
        }
        this.starting = false;
        this.stopping = false;
    }
}



module.exports = InternalServer;