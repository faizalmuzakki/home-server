import dotenv from 'dotenv';
dotenv.config();

export const CONFIG = {
    DEV_TOKEN: process.env.DEV_TOKEN,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
};
