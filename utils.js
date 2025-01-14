const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs/promises');

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

    await fs.cp(
        path.join(__dirname, 'cached-builds', buildName),
        buildDir,
        { recursive: true }
    );

    console.log('✅ Build copied successfully');
    return buildDir;
}
async function runBuild(buildDir) {
    return new Promise((resolve, reject) => {
        console.log('🔨 Starting cabal build');
        const build = spawn('cabal', ['build', 'all'], {
            cwd: buildDir
        });

        let buildOutput = '';
        let buildError = '';

        build.stdout.on('data', data => {
            const output = data.toString();
            buildOutput += output;
            console.log('📝 [Build Output]:', output);
        });

        build.stderr.on('data', data => {
            const error = data.toString();
            buildError += error;
            console.error('⚠️ [Build Error]:', error);
        });

        build.on('close', code => {
            console.log(`Build process exited with code ${code}`);
            if (code === 0) {
                resolve({
                    success: true,
                    output: buildOutput
                });
            } else {
                const parsedError = parseGHCError(buildError);
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

module.exports = {
    parseGHCError,
    copyBuild,
    runBuild
};