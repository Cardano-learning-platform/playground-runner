import express, { json } from 'express';
import { readFile, writeFile } from 'fs/promises';
import { runBuild, copyBuild } from './utils';
import { join } from 'path';
import cors from 'cors';
import { nanoid } from 'nanoid'

const app = express();
app.use(json());
app.use(cors());

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

app.get('/', (req, res) => {
    res.json('Hello World');
});

app.get('/api/build-status/:timestamp', (req, res) => {
    const timestamp = req.params.timestamp;

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Important headers for Vercel and other platforms
    res.setHeader('X-Accel-Buffering', 'no');  // Prevents Nginx from buffering

    // Send initial message
    res.write(`data: ${JSON.stringify({ timestamp, status: 'connected' })}\n\n`);

    // Store the client connection
    clients[timestamp] = clients[timestamp] || [];
    clients[timestamp].push(res);

    // Handle client disconnect
    req.on('close', () => {
        clients[timestamp] = clients[timestamp].filter(client => client !== res);
        if (clients[timestamp].length === 0) {
            delete clients[timestamp];
        }
    });
});

buildEvents.on('update', (data) => {
    const timestamp = data.timestamp;
    if (clients[timestamp]) {
        clients[timestamp].forEach(client => {
            client.write(`data: ${JSON.stringify(data)}\n\n`);

            // If this is a terminal event (completed or failed), close the connection
            if (data.status === 'completed' || data.status === 'failed') {
                // Wait a moment to ensure the data is sent before closing
                setTimeout(() => {
                    client.end();
                }, 100);
            }
        });
    }
});

app.post('/api/exercise/nft-burn', async (req, res) => {
    try {
        const { code } = req.body;
        if (!code) {
            return res.status(400).json({
                success: false,
                error: 'No code provided'
            });
        }
        const timestamp = Date.now();
        const buildId = nanoid();

        // Create new build directory
        const buildDir = await copyBuild(timestamp, 'nft-burn');

        // Inject user code
        const nftPath = join(buildDir, 'src', 'NftMarket', 'NFT.hs');
        const modifiedCode = await injectUserCode(nftPath, code);
        await writeFile(nftPath, modifiedCode);

        buildEvents.emit('update', {
            buildId: timestamp,
            status: 'preparing',
            message: 'Code injected, preparing to build',
            progress: 25
        });

        // Build code will be added here once cached build is ready
        const buildResult = await runBuild(buildDir, timestamp);

        res.json({
            ...buildResult,
            buildId: `nft-burn-${timestamp}`,
            timestamp
        });

    } catch (error) {
        console.error('Error:', error);

        buildEvents.emit('update', {
            buildId: timestamp,
            status: 'failed',
            message: `Error: ${error.message}`,
            progress: 100,
            error: { message: error.message }
        });

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});