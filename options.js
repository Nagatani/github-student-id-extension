document.addEventListener('DOMContentLoaded', async () => {
  const textarea = document.getElementById('raw-data');
  const saveBtn = document.getElementById('save-btn');
  const status = document.getElementById('status');

  // 保存済みの生テキストがあれば復元
  const stored = await chrome.storage.local.get(['rawText']);
  if (stored.rawText) {
    textarea.value = stored.rawText;
  }

  saveBtn.addEventListener('click', async () => {
    const raw = textarea.value.trim();
    if (!raw) {
      await chrome.storage.local.set({ studentMap: {}, rawText: '' });
      status.textContent = 'データをクリアしました。';
      status.style.color = '#57609a';
      return;
    }

    try {
      const studentMap = parseInputData(raw);
      const count = Object.keys(studentMap).length;

      // パース済みMapと再編集用の生テキストを両方保存
      await chrome.storage.local.set({ studentMap, rawText: raw });

      status.textContent = `保存完了: ${count} 件の学生データを登録しました。`;
      status.style.color = '#1a7f37';
    } catch (err) {
      status.textContent = `エラー: ${err.message}`;
      status.style.color = '#cf222e';
    }
  });
});

function parseInputData(text) {
  // 1. JSON の場合
  if (text.startsWith('{')) {
    return JSON.parse(text);
  }

  // 2. CSV / TSV（Excelペースト）の場合
  const result = {};
  const lines = text.split(/\r?\n/);

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    // タブが含まれていればTSV、無ければカンマ区切りと判定
    const delimiter = trimmed.includes('\t') ? '\t' : ',';
    const cols = trimmed.split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, ''));

    // ヘッダー行（github, id, name 等）があればスキップ
    if (index === 0 && (cols[0].toLowerCase().includes('github') || cols[0].includes('アカウント'))) {
      return;
    }

    const [githubUser, studentId, name, group] = cols;
    if (githubUser) {
      const cleanUser = githubUser.replace(/^@/, '');
      result[cleanUser] = {
        id: studentId || '',
        name: name || '',
        group: group || ''
      };
    }
  });

  return result;
}