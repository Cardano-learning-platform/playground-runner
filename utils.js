import fs from 'fs/promises'
import { spawn } from 'child_process'
import path from 'path'
import EventEmitter from 'events'

const buildEvents = new EventEmitter();

function parseGHCError(errorOutput) {

    const errorLines = errorOutput.split('\n');
    let lastError = '';

    for (let i = errorLines.length - 1; i >= 0; i--) {
        const line = errorLines[i];
        if (line.includes('error:')) {

            const relevantLines = errorLines.slice(i, i + 4).filter(l => l.trim());
            lastError = relevantLines.join('\n');
            break;
        }
    }

    if (!lastError) {
        lastError = errorLines.slice(-3).join('\n');
    }


    const errorInfo = {
        message: lastError
    };


    const lineMatch = lastError.match(/:(\d+):\d+:/);
    if (lineMatch) {
        errorInfo.line = parseInt(lineMatch[1]);
    }


    const fileMatch = lastError.match(/([^/\s]+\.hs):/);
    if (fileMatch) {
        errorInfo.file = fileMatch[1];
    }

    return errorInfo;
}
async function copyBuild(timestamp, buildName) {
    const buildDir = path.join(__dirname, 'student-builds', `${buildName}-${timestamp}`);
    console.log(`📂 Copying build to: ${buildDir}`);

    buildEvents.emit('update', {
        timestamp,
        status: 'preparing',
        message: 'Copying build files...',
        progress: 10
    });

    await fs.cp(
        path.join(__dirname, 'cached-builds', buildName),
        buildDir,
        { recursive: true }
    );

    console.log('✅ Build copied successfully');
    buildEvents.emit('update', {
        timestamp,
        status: 'preparing',
        message: 'Build files prepared',
        progress: 20
    });
    return buildDir;
}
async function runBuild(buildDir, timestamp) {
    return new Promise((resolve, reject) => {
        console.log('🔨 Starting cabal build');

        buildEvents.emit('update', {
            timestamp,
            status: 'building',
            message: 'Starting build process...',
            progress: 30
        });

        const build = spawn('cabal', ['build', 'all'], {
            cwd: buildDir
        });

        let buildOutput = '';
        let buildError = '';

        build.stdout.on('data', data => {
            const output = data.toString();
            buildOutput += output;
            console.log('📝 [Build Output]:', output);
            buildEvents.emit('update', {
                timestamp,
                status: 'building',
                message: 'Building...',
                progress: 50,
                outputLine: output
            });
        });

        build.stderr.on('data', data => {
            const error = data.toString();
            buildError += error;
            console.error('⚠️ [Build Error]:', error);
            buildEvents.emit('update', {
                timestamp,
                status: 'building',
                message: 'Building with warnings/errors...',
                progress: 50,
                errorLine: error
            });
        });

        build.on('close', code => {
            console.log(`Build process exited with code ${code}`);
            buildEvents.emit('update', {
                timestamp,
                status: 'completed',
                message: 'Build completed successfully',
                progress: 100
            });
            if (code === 0) {
                resolve({
                    success: true,
                    output: buildOutput
                });
            } else {
                const parsedError = parseGHCError(buildError);
                buildEvents.emit('update', {
                    timestamp,
                    status: 'failed',
                    message: 'Build failed',
                    progress: 100,
                    error: parsedError
                });
                resolve({
                    success: false,
                    error: 'Build failed',
                    output: parsedError.message,
                    errorOutput: parsedError
                });
            }
        });
    });
}

export {
    parseGHCError,
    copyBuild,
    runBuild,
    buildEvents
};