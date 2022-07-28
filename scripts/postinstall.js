const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const https = require("https");
const yauzl = require("yauzl");

const VERBOSE = true;
const URL = "https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip";
const MODEL_DIR = path.resolve(__dirname, "..", "model");

(async () => {
    if (!fs.existsSync(MODEL_DIR)) {
        fs.mkdirSync(MODEL_DIR, { recursive: true });
    }

    const zip = path.resolve(os.tmpdir(), "model.zip");
    await download(URL, zip);
    VERBOSE && console.log("Downloaded model to", zip);

    yauzl.open(zip, { lazyEntries: true }, (err, zipfile) => {
        if (err) throw err;
        zipfile.readEntry();
        zipfile
            .on("entry", (entry) => {
                if (/\/$/.test(entry.fileName)) {
                    zipfile.readEntry();
                } else {
                    zipfile.openReadStream(entry, (err, stream) => {
                        if (err) {
                            throw err;
                        }

                        const dest = path.resolve(
                            MODEL_DIR,
                            entry.fileName.replace("vosk-model-small-en-us-0.15/", ""),
                        );
                        if (!fs.existsSync(path.dirname(dest))) {
                            fs.mkdirSync(path.dirname(dest), { recursive: true });
                            VERBOSE && console.log("Created directory", path.dirname(dest));
                        }

                        stream.pipe(fs.createWriteStream(dest));
                        stream
                            .on("end", () => {
                                VERBOSE && console.log("Extracted", dest);
                                zipfile.readEntry();
                            })
                            .on("error", (err) => {
                                throw err;
                            });
                    });
                }
            })
            .on("error", (err) => {
                throw err;
            });
    });
})();

/**
 * Download the model and extract it to the correct location.
 * @param {string} url The url of the model to download
 * @param {string} to The path to save the model to
 * @param {number} redirect The number of redirects to follow
 * @returns {Promise<string>} The path to the model
 */
function download(url, to, redirect = 0) {
    if (redirect === 0) {
        VERBOSE && console.log(`Downloading ${url} to ${to}`);
    } else {
        VERBOSE && console.log(`Redirecting to ${url}`);
    }

    return new Promise((resolve, reject) => {
        if (!fs.existsSync(path.dirname(to))) {
            fs.mkdirSync(path.dirname(to), { recursive: true });
        }

        let done = true;
        const file = fs.createWriteStream(to);
        const request = https.get(url, (res) => {
            if (res.statusCode === 302 && res.headers.location !== undefined) {
                done = false;
                file.close();
                resolve(download(res.headers.location, to, redirect + 1));
                return;
            }
            res.pipe(file);
        });

        file.on("finish", () => {
            if (done) {
                resolve(to);
            }
        });

        request.on("error", (err) => {
            fs.unlink(to, () => reject(err));
        });

        file.on("error", (err) => {
            fs.unlink(to, () => reject(err));
        });

        request.end();
    });
}