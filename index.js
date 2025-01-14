const express = require('express');
const fs = require('fs/promises');
const { runBuild, copyBuild } = require('./utils');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const CODE_START_MARKER = '---Code starts here---';
const CODE_END_MARKER = '---User code ends here---';

async function injectUserCode(filePath, userCode) {
    const content = await fs.readFile(filePath, 'utf8');
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

        // Create new build directory
        const buildDir = await copyBuild(timestamp, 'nft-burn');

        // Inject user code
        const nftPath = path.join(buildDir, 'src', 'NftMarket', 'NFT.hs');
        const modifiedCode = await injectUserCode(nftPath, code);
        await fs.writeFile(nftPath, modifiedCode);

        // Build code will be added here once cached build is ready
        const buildResult = await runBuild(buildDir);

        res.json({
            ...buildResult,
            buildId: `nft-burn-${timestamp}`
        });

    } catch (error) {
        console.error('Error:', error);
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