(async () => {
  let studentMap = {};

  // アカウント名を小文字に統一して検索しやすいマップを作成
  function normalizeMap(rawMap) {
    const normalized = {};
    for (const [key, val] of Object.entries(rawMap || {})) {
      if (key) {
        normalized[key.trim().toLowerCase()] = val;
      }
    }
    return normalized;
  }

  // 1. chrome.storage からデータ取得
  const stored = await chrome.storage.local.get(['studentMap']);
  if (stored.studentMap) {
    studentMap = normalizeMap(stored.studentMap);
    console.log(`[GitHub-StudentID] 名簿データをロードしました (${Object.keys(studentMap).length} 件)`);
  } else {
    console.warn('[GitHub-StudentID] 名簿データが登録されていません。拡張機能のオプションから登録してください。');
  }

  // 設定変更時のリアルタイム反映
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.studentMap) {
      studentMap = normalizeMap(changes.studentMap.newValue || {});
      console.log(`[GitHub-StudentID] 名簿データを更新しました (${Object.keys(studentMap).length} 件)`);

      // 既存バッジを削除してフラグをリセットし再評価
      document.querySelectorAll('.student-badge-container').forEach(el => el.remove());
      document.querySelectorAll('[data-student-id-checked]').forEach(el => {
        el.removeAttribute('data-student-id-checked');
      });
      injectStudentBadges();
    }
  });

  // 2. リンクからGitHubユーザー名を安全に抽出する関数
  function extractUsername(link) {
    // a) href 属性（例: "/octocat" や "https://github.com/octocat"）からパスを取得
    const href = link.getAttribute('href');
    if (href) {
      const match = href.match(/^(?:https?:\/\/[^\/]+)?\/([a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38})\/?$/);
      if (match && !['settings', 'pulls', 'issues', 'notifications', 'explore', 'orgs'].includes(match[1])) {
        return match[1].toLowerCase();
      }
    }

    // b) data-hovercard-url / data-hovercard-type からのフォールバック
    const hovercardUrl = link.getAttribute('data-hovercard-url');
    if (hovercardUrl) {
      const match = hovercardUrl.match(/\/users\/([^\/]+)\/hovercard/);
      if (match) {
        return match[1].toLowerCase();
      }
    }

    // c) リンク内テキスト（余分な空白・@・改行を除去）
    const text = link.textContent.trim().replace(/^@/, '').split(/\s+/)[0];
    if (text && /^[a-zA-Z0-9-]+$/.test(text)) {
      return text.toLowerCase();
    }

    return null;
  }

  // 3. バッジ注入処理
  function injectStudentBadges() {
    // PR一覧、コミット、Issue、ディスカッション等のユーザーリンクを幅広く捕捉
    const selector = [
      'a.author',
      'a[data-hovercard-type="user"]',
      'a.commit-author',
      'a.Link--primary[href^="/"]',
      'a.user-mention'
    ].map(s => `${s}:not([data-student-id-checked])`).join(', ');

    const userLinks = document.querySelectorAll(selector);

    userLinks.forEach(link => {
      // 重複チェック防止
      link.setAttribute('data-student-id-checked', 'true');

      // リンクが画像だけの場合や空リンクは除外
      if (!link.textContent.trim() && link.children.length > 0) return;

      const username = extractUsername(link);
      if (!username) return;

      const student = studentMap[username];

      if (student) {
        // --- 割り当て成功時のログ ---
        console.log(
          `%c[GitHub-StudentID] ✅ 割り当て成功: @${username} ->${student.id} ${student.name} (${student.group || 'グループなし'})`,
          'color: #1a7f37; font-weight: bold;'
        );

        // バッジ用コンテナを作成（元のリンクテキストの後ろにインラインで追加）
        const container = document.createElement('span');
        container.className = 'student-badge-container';

        // グループバッジ（指定がある場合のみ）
        if (student.group) {
          const groupBadge = document.createElement('span');
          groupBadge.className = 'badge-group';
          groupBadge.textContent = student.group;
          container.appendChild(groupBadge);
        }

        // 学籍番号・氏名バッジ
        const idBadge = document.createElement('span');
        idBadge.className = 'badge-id';
        const labelParts = [student.id, student.name].filter(Boolean);
        idBadge.textContent = labelParts.length > 0 ? labelParts.join(' ') : student.id;
        container.appendChild(idBadge);

        // 重要: リンクを書き換えるのではなく、リンク要素の直後（afterend）に追加
        link.insertAdjacentElement('afterend', container);
      } else {
        // --- 未登録ユーザーのログ ---
        console.warn(`[GitHub-StudentID] ⚠️ 未登録ユーザー: @${username} (名簿データに見つかりません)`);
      }
    });
  }

  // 初回実行
  injectStudentBadges();

  // GitHubのSPA遷移・動的読み込みを監視（スロットリングして過度な負荷を防止）
  let timeoutId = null;
  const observer = new MutationObserver(() => {
    if (timeoutId) return;
    timeoutId = setTimeout(() => {
      injectStudentBadges();
      timeoutId = null;
    }, 100);
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();