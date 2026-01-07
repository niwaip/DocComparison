"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiQueueEvents = exports.aiQueue = exports.aiQueueName = exports.redisUrl = void 0;
const env_1 = require("./env");
exports.redisUrl = (0, env_1.env)("REDIS_URL", "redis://localhost:6379");
exports.aiQueueName = "ai";
const { Queue, QueueEvents } = require("bullmq");
exports.aiQueue = new Queue(exports.aiQueueName, {
    connection: { url: exports.redisUrl }
});
exports.aiQueueEvents = new QueueEvents(exports.aiQueueName, {
    connection: { url: exports.redisUrl }
});
