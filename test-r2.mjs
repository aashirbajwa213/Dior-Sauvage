import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { AwsClient } from 'aws4fetch';

const accessKeyId = '73d40fefffbf4b1ebfcbcd5b921218a9';
const secretAccessKey = '4ff2aa1991b3a11d5ab319549e47c87280630b724dc1912af58d2ed3c974fcc3';
const endpoint = 'https://258780d0baed98f3ae02166d94442ed4.r2.cloudflarestorage.com';
const bucket = 'gionee-media';

async function testR2() {
    console.log("Testing R2 Upload Image...");
    try {
        const s3 = new S3Client({
            region: 'auto',
            endpoint: endpoint,
            credentials: {
                accessKeyId: accessKeyId,
                secretAccessKey: secretAccessKey,
            },
        });

        const buffer = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 11, 73, 68, 65, 84, 8, 153, 99, 248, 15, 4, 0, 9, 251, 3, 253, 227, 85, 242, 156, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);
        const fileName = `uploads/media/test-image.png`;

        await s3.send(new PutObjectCommand({
            Bucket: bucket,
            Key: fileName,
            Body: buffer,
            ContentType: 'image/png',
        }));

        console.log("Upload successful!");
    } catch (e) {
        console.error("Upload failed:", e.message);
    }
}

testR2();
