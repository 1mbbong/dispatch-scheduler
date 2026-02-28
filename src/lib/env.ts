// Fail-fast helper for required environment variables.
// Throws at module load time so missing config is caught immediately.

export function getRequiredEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(
            `❌ Missing required environment variable: ${name}\n` +
            `   ➜ Copy .env.example to .env and fill in the values.\n` +
            `   ➜ See: https://github.com/your-org/dispatch-scheduler#setup`
        );
    }
    return value;
}
