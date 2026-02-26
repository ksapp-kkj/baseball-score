/**
 * 設定・状態管理
 */
const positionOptions = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH"];

// ローカルストレージからデータを読み込み
let players = JSON.parse(localStorage.getItem('baseball_players')) || [];
let currentEditingPlayerId = null;

/**
 * 起動時の処理
 */
window.onload = function() {
    renderPlayerList();
    
    // チーム情報の復元
    const teamNameInput = document.getElementById('team-name-input');
    const managerNameInput = document.getElementById('manager-name-input');
    
    if (teamNameInput) teamNameInput.value = localStorage.getItem('team_name') || "";
    if (managerNameInput) managerNameInput.value = localStorage.getItem('manager_name') || "";
    
    // 入力イベントの設定
    teamNameInput?.addEventListener('input', (e) => localStorage.setItem('team_name', e.target.value));
    managerNameInput?.addEventListener('input', (e) => localStorage.setItem('manager_name', e.target.value));
    
    setupNavigation();
};

/**
 * ナビゲーション制御
 */
function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.content-section');
    
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const target = item.getAttribute('data-target');
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            sections.forEach(sec => {
                sec.classList.remove('active');
                if(sec.id === target) sec.classList.add('active');
            });
        });
    });
}

/**
 * 選手登録 (モーダル)
 */
function showAddPlayerModal() {
    document.getElementById('modal-title').innerText = "選手登録";
    
    const subPosHtml = positionOptions.map(pos => `
        <label class="checkbox-item">
            <input type="checkbox" name="sub-pos" value="${pos}"> ${pos}
        </label>
    `).join('');

    document.getElementById('modal-body').innerHTML = `
        <div class="edit-form">
            <input type="number" id="p-number" placeholder="背番号" inputmode="numeric">
            <input type="text" id="p-name" placeholder="氏名">
            <select id="p-side">
                <option value="右投右打">右投右打</option>
                <option value="右投左打">右投左打</option>
                <option value="左投左打">左投左打</option>
                <option value="左投右打">左投右打</option>
            </select>
            <select id="p-main-pos">
                <option value="" disabled selected>メイン守備</option>
                ${positionOptions.map(pos => `<option value="${pos}">${pos}</option>`).join('')}
            </select>
            <p style="font-size:0.8rem; margin:0; font-weight:bold;">サブ守備:</p>
            <div class="checkbox-grid">${subPosHtml}</div>
            <div class="modal-btns">
                <button class="btn-save" onclick="addPlayer()">登録する</button>
            </div>
        </div>
    `;
    document.getElementById('modal-overlay').style.display = 'flex';
}

function addPlayer() {
    const num = document.getElementById('p-number').value || "無";
    const name = document.getElementById('p-name').value;
    const mainPos = document.getElementById('p-main-pos').value;
    const subPosArray = Array.from(document.querySelectorAll('input[name="sub-pos"]:checked')).map(cb => cb.value);

    if(!name || !mainPos) return alert("名前とメイン守備は必須です");

    players.push({
        id: Date.now(),
        number: num,
        name: name,
        side: document.getElementById('p-side').value,
        mainPos: mainPos,
        subPos: subPosArray,
        stats: { avg: ".000", hits: 0, ab: 0 }
    });
    
    saveAndRefresh();
    closeModal();
}

/**
 * 選手閲覧 (モーダル初期状態)
 */
function showPlayerDetail(id) {
    const p = players.find(player => player.id === id);
    if(!p) return;
    currentEditingPlayerId = id;

    document.getElementById('modal-title').innerText = "選手情報";
    document.getElementById('modal-body').innerHTML = `
        <div class="view-content">
            <p><strong>氏名:</strong> ${p.name}</p>
            <p><strong>背番号:</strong> ${p.number}</p>
            <p><strong>投打:</strong> ${p.side}</p>
            <p><strong>メイン守備:</strong> ${p.mainPos}</p>
            <p><strong>サブ守備:</strong> ${p.subPos.length > 0 ? p.subPos.join(', ') : "なし"}</p>
            <div class="modal-btns">
                <button class="btn-edit-mode" onclick="showEditForm(${id})">編集する</button>
                <button class="btn-delete" onclick="deletePlayer(${id})">削除する</button>
            </div>
        </div>
    `;
    document.getElementById('modal-overlay').style.display = 'flex';
}

/**
 * 選手編集 (モーダル切り替え)
 */
function showEditForm(id) {
    const p = players.find(player => player.id === id);
    document.getElementById('modal-title').innerText = `${p.name} の編集`;
    
    const subCheckboxesHtml = positionOptions.map(pos => {
        const checked = p.subPos.includes(pos) ? "checked" : "";
        return `<label class="checkbox-item"><input type="checkbox" name="edit-sub-pos" value="${pos}" ${checked}> ${pos}</label>`;
    }).join('');

    document.getElementById('modal-body').innerHTML = `
        <div class="edit-form">
            <label>氏名:</label> <input type="text" id="edit-name" value="${p.name}">
            <label>背番号:</label> <input type="number" id="edit-number" value="${p.number}">
            <label>投打:</label>
            <select id="edit-side">
                <option value="右投右打" ${p.side==='右投右打'?'selected':''}>右投右打</option>
                <option value="右投左打" ${p.side==='右投左打'?'selected':''}>右投左打</option>
                <option value="左投左打" ${p.side==='左投左打'?'selected':''}>左投左打</option>
                <option value="左投右打" ${p.side==='左投右打'?'selected':''}>左投右打</option>
            </select>
            <label>メイン守備:</label>
            <select id="edit-main-pos">
                ${positionOptions.map(pos => `<option value="${pos}" ${p.mainPos===pos?'selected':''}>${pos}</option>`).join('')}
            </select>
            <label>サブ守備:</label>
            <div class="checkbox-grid">${subCheckboxesHtml}</div>
            <div class="modal-btns">
                <button class="btn-save" onclick="updatePlayer()">保存する</button>
                <button class="btn-delete" onclick="deletePlayer(${id})">削除する</button>
            </div>
        </div>
    `;
}

function updatePlayer() {
    const p = players.find(player => player.id === currentEditingPlayerId);
    if (!p) return;

    p.name = document.getElementById('edit-name').value;
    p.number = document.getElementById('edit-number').value;
    p.side = document.getElementById('edit-side').value;
    p.mainPos = document.getElementById('edit-main-pos').value;
    p.subPos = Array.from(document.querySelectorAll('input[name="edit-sub-pos"]:checked')).map(cb => cb.value);

    saveAndRefresh();
    closeModal();
}

/**
 * 削除処理
 */
function deletePlayer(id) {
    if(confirm("この選手を削除しますか？")) {
        players = players.filter(p => p.id !== id);
        saveAndRefresh();
        closeModal();
    }
}

/**
 * ユーティリティ: 選手一覧の描画（背番号昇順でソート）
 */
function renderPlayerList() {
    const body = document.getElementById('player-list-body');
    if (!body) return;

    // 表示用にコピーを作ってからソート（元の配列の順番は壊さない）
    const sortedPlayers = [...players].sort((a, b) => {
        // 数値に変換して比較（"無"などは大きい数字として扱い、後ろに送る）
        const numA = (a.number === "無" || a.number === "") ? Infinity : parseFloat(a.number);
        const numB = (b.number === "無" || b.number === "") ? Infinity : parseFloat(b.number);
        
        return numA - numB;
    });

    body.innerHTML = sortedPlayers.map(p => `
        <tr>
            <td>${p.number}</td>
            <td><span class="name-link" onclick="showPlayerDetail(${p.id})">${p.name}</span></td>
            <td>${p.side}</td>
            <td>${p.mainPos}</td>
        </tr>
    `).join('');
}

function saveAndRefresh() {
    localStorage.setItem('baseball_players', JSON.stringify(players));
    renderPlayerList();
}

function closeModal() {
    const modal = document.getElementById('modal-overlay');
    if (modal) modal.style.display = 'none';
    currentEditingPlayerId = null;
}