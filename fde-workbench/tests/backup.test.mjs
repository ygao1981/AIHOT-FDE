import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, existsSync, mkdirSync, statSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Store } from '../src/store.mjs';
import { analysisKey, prepareArticle } from '../src/analysis.mjs';
import { fixture, add, output } from './helpers.mjs';

test('management commands refuse an empty data directory without creating a database or backup', t => {
  const directory=mkdtempSync(join(tmpdir(),'fde-empty-management-'));
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const script=fileURLToPath(new URL('../scripts/manage.mjs',import.meta.url));
  for(const command of ['status','backup','export','pause','resume']) {
    const result=spawnSync(process.execPath,[script,command],{
      env:{FDE_DATA_DIR:directory,FDE_MODEL_PROVIDER:'off',FDE_COLLECT_ENABLED:'false',FDE_ANALYSIS_ENABLED:'false',FDE_AUTO_ANALYZE:'false'},
      encoding:'utf8',timeout:10000,
    });
    assert.equal(result.error,undefined,command);
    assert.equal(result.status,1,command);
    assert.match(result.stderr,/没有找到资料库/,command);
    assert.equal(result.stdout,'',command);
    assert.deepEqual(readdirSync(directory),[],command);
  }
});

test('online backup captures committed WAL data while another transaction remains uncommitted', async t => {
  const { store, config, dir } = fixture(t);
  store.db.exec('PRAGMA wal_autocheckpoint=0');
  const article = add(store), key = analysisKey(prepareArticle(article), config);
  store.editArticle(article.id, { personalNotes: '已提交的研究判断。', editorialStatus: 'shortlisted' });
  store.queue(article.id, key);
  const attempt = store.beginAttempt(article.id, key, config, 0.2);
  store.completeAttempt(attempt, output()); // Fixture data only; no model is invoked.
  assert.equal(store.db.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
  assert.ok(statSync(store.path + '-wal').size > 0);

  const writer = new DatabaseSync(store.path);
  let snapshot;
  try {
    writer.exec('BEGIN IMMEDIATE');
    writer.prepare('UPDATE articles SET personal_notes=? WHERE id=?').run('尚未提交的修改。', article.id);
    writer.prepare('UPDATE attempts SET cost_usd=? WHERE id=?').run(999, attempt.id);
    const path = join(dir, 'online-backup.sqlite');
    await store.backupTo(path);
    if (process.platform !== 'win32') assert.equal(statSync(path).mode & 0o777, 0o600);

    // Only the backup file is copied. The original WAL and SHM are intentionally not available here.
    const independentDir = join(dir, 'independent'); mkdirSync(independentDir, { mode: 0o700 });
    const independentFile = join(independentDir, 'research.sqlite');
    copyFileSync(path, independentFile);
    assert.equal(existsSync(independentFile + '-wal'), false);
    assert.equal(existsSync(independentFile + '-shm'), false);
    snapshot = new DatabaseSync(independentFile, { readOnly: true });
    assert.equal(snapshot.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.deepEqual(snapshot.prepare('PRAGMA foreign_key_check').all(), []);
    const saved = snapshot.prepare('SELECT * FROM articles WHERE id=?').get(article.id);
    assert.equal(saved.personal_notes, '已提交的研究判断。');
    assert.equal(saved.editorial_status, 'shortlisted');
    assert.deepEqual(JSON.parse(saved.analysis_json), output().result);
    const receipt = snapshot.prepare('SELECT * FROM attempts WHERE id=?').get(attempt.id);
    assert.equal(receipt.status, 'completed');
    assert.equal(receipt.cost_usd, output().costUsd);
    assert.equal(receipt.input_tokens, output().usage.inputTokens);

    writer.exec('ROLLBACK');
    store.editArticle(article.id, { personalNotes: '备份之后保存的新笔记。' });
    assert.equal(store.getArticle(article.id).personalNotes, '备份之后保存的新笔记。');
    assert.equal(snapshot.prepare('SELECT personal_notes FROM articles WHERE id=?').get(article.id).personal_notes, '已提交的研究判断。');
  } finally {
    snapshot?.close();
    try { writer.exec('ROLLBACK'); } catch { /* It was already rolled back on the success path. */ }
    writer.close();
  }
});

test('restored running receipts become unknown without losing reservations, analysis or personal notes', async t => {
  const { store, config, dir } = fixture(t);
  const completed = add(store, 1), running = add(store, 2);
  store.editArticle(completed.id, { personalNotes: '已完成案例的补充判断。', editorialStatus: 'drafting' });
  const completedKey = analysisKey(prepareArticle(completed), config);
  store.queue(completed.id, completedKey);
  store.completeAttempt(store.beginAttempt(completed.id, completedKey, config, 0.2), output());
  store.editArticle(running.id, { personalNotes: '等待核对原文效果。', editorialStatus: 'shortlisted' });
  const runningKey = analysisKey(prepareArticle(running), config);
  store.queue(running.id, runningKey);
  const attempt = store.beginAttempt(running.id, runningKey, config, 0.25);
  const backupPath = join(dir, 'interrupted-backup.sqlite');
  await store.backupTo(backupPath);

  const restoredDir = join(dir, 'restored'); mkdirSync(restoredDir, { mode: 0o700 });
  copyFileSync(backupPath, join(restoredDir, 'research.sqlite'));
  const restored = new Store(restoredDir, store.catalog);
  try {
    assert.equal(restored.recoverInterrupted(), 1);
    assert.equal(restored.recoverInterrupted(), 0);
    assert.equal(restored.db.prepare('SELECT status FROM attempts WHERE id=?').get(attempt.id).status, 'unknown');
    assert.ok(restored.setting('analysis_pause'));
    assert.equal(restored.overview(config).usage.monthReservedUsd, 0.25);
    assert.equal(restored.overview(config).usage.monthCostUsd, output().costUsd);
    assert.equal(restored.overview(config).usage.attempts24h, 2);
    assert.equal(restored.getArticle(running.id).status, 'failed');
    assert.equal(restored.getArticle(running.id).personalNotes, '等待核对原文效果。');
    assert.equal(restored.getArticle(running.id).editorialStatus, 'shortlisted');
    assert.throws(() => restored.queue(running.id, runningKey), { code: 'retry_confirmation' });
    assert.deepEqual(restored.getArticle(completed.id).analysis, output().result);
    assert.equal(restored.getArticle(completed.id).personalNotes, '已完成案例的补充判断。');
    assert.equal(restored.getArticle(completed.id).editorialStatus, 'drafting');
    // Opening a separate restored copy does not change the live source or dispatch a job.
    assert.equal(store.getArticle(running.id).status, 'analyzing');
    assert.equal(restored.db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  } finally { restored.close(); }
});
