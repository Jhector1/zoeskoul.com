-- CreateIndex
CREATE INDEX "PracticeAttempt_instanceId_revealUsed_userId_createdAt_idx" ON "PracticeAttempt"("instanceId", "revealUsed", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "PracticeAttempt_instanceId_revealUsed_guestId_createdAt_idx" ON "PracticeAttempt"("instanceId", "revealUsed", "guestId", "createdAt");

-- CreateIndex
CREATE INDEX "PracticeAttempt_sessionId_revealUsed_createdAt_idx" ON "PracticeAttempt"("sessionId", "revealUsed", "createdAt");

-- CreateIndex
CREATE INDEX "PracticeQuestionInstance_sessionId_answeredAt_idx" ON "PracticeQuestionInstance"("sessionId", "answeredAt");
