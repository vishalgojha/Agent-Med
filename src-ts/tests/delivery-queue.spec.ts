import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  ackDelivery,
  enqueueDelivery,
  getDeliveryQueueSnapshotSync,
  resolveDeliveryQueuePath
} from "../messaging/delivery-queue.js";
import { setupTestDb, teardownTestDb } from "./test-helpers.js";

test("delivery queue snapshot reports queued/failed and oldest pending", async () => {
  const dbPath = setupTestDb("delivery-queue-snapshot");
  try {
    const queueId = await enqueueDelivery({
      followUpId: "fu_snapshot_1",
      to: "+15550000001",
      body: "Please call the clinic.",
      channel: "sms"
    });

    const queuePath = resolveDeliveryQueuePath();
    const failedDir = path.join(queuePath, "failed");
    fs.mkdirSync(failedDir, { recursive: true });
    fs.writeFileSync(
      path.join(failedDir, "fu_failed_1.json"),
      JSON.stringify({ id: "fu_failed_1", reason: "test" }),
      "utf-8"
    );

    const snapshot = getDeliveryQueueSnapshotSync();
    assert.equal(snapshot.queued, 1);
    assert.equal(snapshot.failed, 1);
    assert.equal(typeof snapshot.oldestPendingAt, "string");
    assert.equal(typeof snapshot.oldestPendingAgeMs, "number");
    assert.equal(snapshot.error, null);

    await ackDelivery(queueId);
    const afterAck = getDeliveryQueueSnapshotSync();
    assert.equal(afterAck.queued, 0);
    assert.equal(afterAck.failed, 1);
  } finally {
    teardownTestDb(dbPath);
  }
});
