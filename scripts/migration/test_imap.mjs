import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import fs from 'fs';

const client = new ImapFlow({
    host: 'imap.hostinger.com',
    port: 993,
    secure: true,
    auth: {
        user: 'support@gionee.com.pk',
        pass: 'Abl24288??'
    },
    logger: false
});

const main = async () => {
    console.log('Connecting to IMAP server...');
    await client.connect();
    console.log('Connected!');

    let lock = await client.getMailboxLock('INBOX');
    try {
        console.log('Fetching last 50 emails...');
        const status = await client.status('INBOX', { messages: true });
        const total = status.messages;
        const start = Math.max(1, total - 50);
        
        const messages = client.fetch(`${start}:*`, { source: true, envelope: true }, { uid: false });
        
        const extracted = [];
        
        for await (let msg of messages) {
            const parsed = await simpleParser(msg.source);
            extracted.push({
                subject: parsed.subject,
                date: parsed.date,
                text: parsed.text,
                html: parsed.html
            });
        }
        
        // Take the last 50 emails
        const orderEmails = extracted.reverse().slice(0, 50);
        fs.writeFileSync('test_emails.json', JSON.stringify(orderEmails, null, 2));
        console.log(`Saved ${orderEmails.length} emails to test_emails.json for analysis.`);
    } catch (err) {
        console.error('Error fetching emails:', err);
    } finally {
        lock.release();
    }

    await client.logout();
}

main().catch(err => console.error(err));
