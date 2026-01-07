import { env } from "./env";

export const redisUrl = env("REDIS_URL", "redis://localhost:6379");

export const aiQueueName = "ai";

declare const require: any;
const { Queue, QueueEvents } = require("bullmq");

export const aiQueue = new Queue(aiQueueName, {
  connection: { url: redisUrl }
});

export const aiQueueEvents = new QueueEvents(aiQueueName, {
  connection: { url: redisUrl }
});
