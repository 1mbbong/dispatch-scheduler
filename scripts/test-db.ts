import { Client } from 'pg';

const url = 'postgresql://postgres:postgrespassword@127.0.0.1:5432/dispatch_scheduler?schema=public';
console.log(`Connecting to ${url}...`);

const client = new Client({ connectionString: url });

client.connect()
    .then(() => {
        console.log('✅ Connected successfully to Postgres!');
        return client.query('SELECT NOW()');
    })
    .then((res) => {
        console.log('⏰ Time from DB:', res.rows[0].now);
        return client.end();
    })
    .catch((err) => {
        console.error('❌ Connection failed:', err);
        process.exit(1);
    });
