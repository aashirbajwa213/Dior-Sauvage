import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

dotenv.config();

const accessKeyId = process.env.VITE_R2_ACCESS_KEY_ID || '73d40fefffbf4b1ebfcbcd5b921218a9';
const secretAccessKey = process.env.VITE_R2_SECRET_ACCESS_KEY || '4ff2aa1991b3a11d5ab319549e47c87280630b724dc1912af58d2ed3c974fcc3';
const endpoint = process.env.VITE_R2_ENDPOINT || 'https://258780d0baed98f3ae02166d94442ed4.r2.cloudflarestorage.com';
const bucket = process.env.VITE_R2_BUCKET || 'gionee-media';

const s3 = new S3Client({
    region: 'auto',
    endpoint: endpoint,
    credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
    },
});

async function run() {
    try {
        const data = await s3.send(new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: 'uploads/media/'
        }));
        console.log("Files in R2 Bucket:");
        if (data.Contents) {
            data.Contents.forEach(file => console.log(file.Key, file.Size));
        } else {
            console.log("Bucket is empty or prefix not found.");
        }
    } catch (err) {
        console.error("Error connecting to R2:", err);
    }
}

run();
