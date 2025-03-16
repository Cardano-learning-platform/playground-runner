import express, { json } from 'express';
import { readFile, writeFile } from 'fs/promises';
import { runBuild, copyBuild, buildEvents } from './utils';
import { join } from 'path';
import cors from 'cors';

const app = express();

app.use(json());
app.use(cors());

const clients = {};
let buildStatuses = {}
const CODE_START_MARKER = '---Code starts here---';
const CODE_END_MARKER = '---User code ends here---';

async function injectUserCode(filePath, userCode) {
    const content = await readFile(filePath, 'utf8');
    const startIndex = content.indexOf(CODE_START_MARKER);
    const endIndex = content.indexOf(CODE_END_MARKER);

    if (startIndex === -1 || endIndex === -1) {
        throw new Error('Template markers not found in NFT.hs');
    }

    const before = content.slice(0, startIndex + CODE_START_MARKER.length);
    const after = content.slice(endIndex);
    return `${before}\n${userCode}\n${after}`;
}

buildEvents.on('update', (data) => {
    const timestamp = data.timestamp;

    if (data.status === 'completed' && buildStatuses[timestamp] === 'error') {
        console.log(`Skipping completed status for build ${timestamp} that had errors`);
        return;
    }

    if (data.error || data.errorLine?.includes('error:')) {
        buildStatuses[timestamp] = 'error';
    }

    if (clients[timestamp]) {
        clients[timestamp].forEach(client => {
            client.write(`data: ${JSON.stringify(data)}\n\n`);

            if (data.status === 'completed' || data.status === 'failed') {
                setTimeout(() => {
                    client.end();

                    delete buildStatuses[timestamp];
                }, 100);
            }
        });
    }
});
app.get('/', (req, res) => {
    res.json('hello');
});

app.get('/api/build-status/:timestamp', (req, res) => {
    const timestamp = req.params.timestamp;

=
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    res.setHeader('X-Accel-Buffering', 'no');  // Prevents Nginx from buffering


    res.write(`data: ${JSON.stringify({ timestamp, status: 'connected' })}\n\n`);


    clients[timestamp] = clients[timestamp] || [];
    clients[timestamp].push(res);


    req.on('close', () => {
        clients[timestamp] = clients[timestamp].filter(client => client !== res);
        if (clients[timestamp].length === 0) {
            delete clients[timestamp];
        }
    });
});



app.post('/api/exercise/nft-burn', async (req, res) => {
    const timestamp = Date.now().toString(); // Convert to string for consistency

    try {
        const { code } = req.body;
        if (!code) {
            return res.status(400).json({
                success: false,
                error: 'No code provided'
            });
        }


        res.json({
            success: true,
            message: 'Build started',
            buildId: `nft-burn-${timestamp}`,
            timestamp
        });

        (async () => {
            try {
                const buildDir = await copyBuild(timestamp, 'nft-burn');

                // Inject user code
                const nftPath = join(buildDir, 'src', 'NftMarket', 'NFT.hs');
                const modifiedCode = await injectUserCode(nftPath, code);
                await writeFile(nftPath, modifiedCode);

                buildEvents.emit('update', {
                    timestamp,
                    status: 'preparing',
                    message: 'Code injected, preparing to build',
                    progress: 25
                });

                await runBuild(buildDir, timestamp);
            } catch (error) {
                console.error('Error in async build process:', error);

                buildEvents.emit('update', {
                    timestamp,
                    status: 'failed',
                    message: `Error: ${error.message}`,
                    progress: 100,
                    error: { message: error.message }
                });
            }
        })();
    } catch (error) {
        console.error('Error:', error);

        // If we hit an error before the async process starts, return error response
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
// app.post('/api/exercise/nft-burn', async (req, res) => {
//     const timestamp = Date.now();
//     try {
//         const { code } = req.body;
//         if (!code) {
//             return res.status(400).json({
//                 success: false,
//                 error: 'No code provided'
//             });
//         }
//         // Continue with the build process asynchronously in the background
//         (async () => {
//             try {
//                 // Create new build directory
//                 const buildDir = await copyBuild(timestamp, 'nft-burn');

//                 // Inject user code
//                 const nftPath = join(buildDir, 'src', 'NftMarket', 'NFT.hs');
//                 const modifiedCode = await injectUserCode(nftPath, code);
//                 await writeFile(nftPath, modifiedCode);

//                 buildEvents.emit('update', {
//                     timestamp,
//                     status: 'preparing',
//                     message: 'Code injected, preparing to build',
//                     progress: 25
//                 });

//                 // Run the build
//                 await runBuild(buildDir, timestamp);
//             } catch (error) {
//                 console.error('Error in async build process:', error);

//                 buildEvents.emit('update', {
//                     timestamp,
//                     status: 'failed',
//                     message: `Error: ${error.message}`,
//                     progress: 100,
//                     error: { message: error.message }
//                 });
//             }
//         })();

//         // // Create new build directory
//         // const buildDir = await copyBuild(timestamp, 'nft-burn');

//         // // Inject user code
//         // const nftPath = join(buildDir, 'src', 'NftMarket', 'NFT.hs');
//         // const modifiedCode = await injectUserCode(nftPath, code);
//         // await writeFile(nftPath, modifiedCode);

//         // buildEvents.emit('update', {
//         //     buildId: timestamp,
//         //     status: 'preparing',
//         //     message: 'Code injected, preparing to build',
//         //     progress: 25
//         // });

//         // // Build code will be added here once cached build is ready
//         // const buildResult = await runBuild(buildDir, timestamp);

//         // res.json({
//         //     ...buildResult,
//         //     buildId: `nft-burn-${timestamp}`,
//         //     timestamp
//         // });

//     } catch (error) {
//         console.error('Error:', error);

//         buildEvents.emit('update', {
//             timestamp,
//             status: 'failed',
//             message: `Error: ${error.message}`,
//             progress: 100,
//             error: { message: error.message }
//         });

//         res.status(500).json({
//             success: false,
//             error: error.message
//         });
//     }
// });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});