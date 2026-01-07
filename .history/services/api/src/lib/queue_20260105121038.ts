import { Queue, QueueEvents } from "bullmq";
import { env } from "./env";

export const redisUrl = env("REDIS_URL", "redis://localhost:6379");

export const aiQueueName = "ai";

export const aiQueue = new Queue(aiQueueName, {
  connection: { url: redisUrl }
});

export const aiQueueEvents = new QueueEvents(aiQueueName, {
  connection: { url: redisUrl }
});
