/**
 * 設定・状態管理
 */
const positionOptions = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH"];
const lineupPositionOptions = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH", "EH", "ベンチ"];

let players = JSON.parse(localStorage.getItem('baseball_players')) || [];
let games = JSON.parse(localStorage.getItem('baseball_games')) || [];
let currentEditingPlayerId = null;
let currentGameForScore = null;
let tempLineup = []; 
let currentAtBatColumns = 5; // 打席マトリックスの表示列数

/**
 * 起動時の処理
 */
window.onload = function() {
    renderPlayerList();
    renderGameList();
    updateTeamRecord();
    
    const teamFields = [
        { id: 'team-name-input', key: 'team_name' },
        { id: 'manager-name-input', key: 'manager_name' },
        { id: 'captain-name-input', key: 'captain_name' }
    ];

    teamFields.forEach(field => {
        const el = document.getElementById(field.id);
        if (el) {
            el.value = localStorage.getItem(field.key) || "";
            el.addEventListener('input', (e) => {
                localStorage.setItem(field.key, e.target.value);
            });
        }
    });
    
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
                sec.classList.toggle('active', sec.id === target);
            });
        });
    });
}

function getSuggestedAssistantNumber() {
    let usedNumbers = new Set();
    players.forEach(p => {
        if (p.number !== "無") usedNumbers.add(Number(p.number));
        if (p.pastNumbers) p.pastNumbers.forEach(n => usedNumbers.add(Number(n)));
    });

    for (let i = 100; i <= 999; i++) {
        if (!usedNumbers.has(i)) return i;
    }
    return 100;
}

function formatNumberInput(inputEl) {
    if (!inputEl.value) return;
    let val = inputEl.value;
    val = val.replace(/[０-９]/g, function(s) {
        return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
    });
    val = val.replace(/[^0-9]/g, '');
    inputEl.value = val;
}

/**
 * 選手管理機能
 */
function showAddPlayerModal() {
    document.getElementById('modal-title').innerText = "選手登録";
    const subPosHtml = positionOptions.map(pos => `
        <label class="checkbox-item"><input type="checkbox" name="sub-pos" value="${pos}"> ${pos}</label>
    `).join('');

    const suggestedNum = getSuggestedAssistantNumber();

    document.getElementById('modal-body').innerHTML = `
        <div class="edit-form">
            <input type="text" inputmode="numeric" id="p-number" placeholder="背番号 (助っ人候補: ${suggestedNum})" onblur="formatNumberInput(this)">
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
            <p class="sub-label">サブ守備:</p>
            <div class="checkbox-grid">${subPosHtml}</div>
            <div class="modal-btns"><button class="btn-save" onclick="addPlayer()">登録する</button></div>
        </div>
    `;
    document.getElementById('modal-overlay').style.display = 'flex';
}

function addPlayer() {
    const name = document.getElementById('p-name').value;
    const mainPos = document.getElementById('p-main-pos').value;
    let numInput = document.getElementById('p-number').value;

    if(!name || !mainPos) return alert("名前とメイン守備は必須です");

    numInput = numInput.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).replace(/[^0-9]/g, '');
    const numberToSave = numInput === "" ? "無" : String(numInput);

    if (numberToSave !== "無") {
        const isDuplicate = players.some(p => {
            const usedNow = String(p.number) === numberToSave;
            const usedPast = p.pastNumbers && p.pastNumbers.includes(numberToSave);
            return usedNow || usedPast;
        });

        if (isDuplicate) {
            return alert(`エラー：背番号「${numberToSave}」は登録できません。`);
        }
    }

    players.push({
        id: Date.now(),
        number: numberToSave,
        pastNumbers: [],
        name: name,
        side: document.getElementById('p-side').value,
        mainPos: mainPos,
        subPos: Array.from(document.querySelectorAll('input[name="sub-pos"]:checked')).map(cb => cb.value),
        stats: { avg: ".000", hits: 0, ab: 0 }
    });
    
    saveAndRefreshPlayers();
    closeModal();
}

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

function showEditForm(id) {
    const p = players.find(player => player.id === id);
    document.getElementById('modal-title').innerText = `${p.name} の編集`;
    
    const subCheckboxesHtml = positionOptions.map(pos => `
        <label class="checkbox-item"><input type="checkbox" name="edit-sub-pos" value="${pos}" ${p.subPos.includes(pos) ? "checked" : ""}> ${pos}</label>
    `).join('');

    const suggestedNum = getSuggestedAssistantNumber();

    document.getElementById('modal-body').innerHTML = `
        <div class="edit-form">
            <label>氏名:</label> <input type="text" id="edit-name" value="${p.name}">
            <label>背番号:</label> 
            <input type="text" inputmode="numeric" id="edit-number" value="${p.number === '無' ? '' : p.number}" placeholder="助っ人候補: ${suggestedNum}" onblur="formatNumberInput(this)">
            <label>投打:</label>
            <select id="edit-side">
                <option value="右投右打" ${p.side==='右投右打'?'selected':''}>右投右打</option>
                <option value="右投左打" ${p.side==='右投左打'?'selected':''}>右投左打</option>
                <option value="左投左打" ${p.side==='左投左打'?'selected':''}>左投左打</option>
                <option value="左投右打" ${p.side==='左投右打'?'selected':''}>左投右打</option>
            </select>
            <label>メイン守備:</label>
            <select id="edit-main-pos">${positionOptions.map(pos => `<option value="${pos}" ${p.mainPos===pos?'selected':''}>${pos}</option>`).join('')}</select>
            <label>サブ守備:</label>
            <div class="checkbox-grid">${subCheckboxesHtml}</div>
            <div class="modal-btns"><button class="btn-save" onclick="updatePlayer()">保存する</button></div>
        </div>
    `;
}

function updatePlayer() {
    const p = players.find(player => player.id === currentEditingPlayerId);
    if (!p) return;

    let numInput = document.getElementById('edit-number').value;
    numInput = numInput.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).replace(/[^0-9]/g, '');
    const numberToSave = numInput === "" ? "無" : String(numInput);

    if (numberToSave !== "無") {
        const isDuplicate = players.some(player => {
            if (player.id === currentEditingPlayerId) return false; 
            const usedNow = String(player.number) === numberToSave;
            const usedPast = player.pastNumbers && player.pastNumbers.includes(numberToSave);
            return usedNow || usedPast;
        });

        if (isDuplicate) {
            return alert(`エラー：背番号「${numberToSave}」は変更できません。`);
        }
    }

    if (String(p.number) !== numberToSave && p.number !== "無") {
        if (!p.pastNumbers) p.pastNumbers = [];
        if (!p.pastNumbers.includes(String(p.number))) {
            p.pastNumbers.push(String(p.number));
        }
    }

    p.name = document.getElementById('edit-name').value;
    p.number = numberToSave;
    p.side = document.getElementById('edit-side').value;
    p.mainPos = document.getElementById('edit-main-pos').value;
    p.subPos = Array.from(document.querySelectorAll('input[name="edit-sub-pos"]:checked')).map(cb => cb.value);

    saveAndRefreshPlayers();
    closeModal();
}

function deletePlayer(id) {
    if(confirm("この選手を削除しますか？")) {
        players = players.filter(p => p.id !== id);
        saveAndRefreshPlayers();
        closeModal();
    }
}

function renderPlayerList() {
    const body = document.getElementById('player-list-body');
    if (!body) return;

    const sortedPlayers = [...players].sort((a, b) => {
        const numA = (a.number === "無" || a.number === "") ? Infinity : parseFloat(a.number);
        const numB = (b.number === "無" || b.number === "") ? Infinity : parseFloat(b.number);
        return numA - numB;
    });

    body.innerHTML = sortedPlayers.map(p => `
        <tr><td>${p.number}</td><td><span class="name-link" onclick="showPlayerDetail(${p.id})">${p.name}</span></td><td>${p.side}</td><td>${p.mainPos}</td></tr>
    `).join('');
}

/**
 * 試合管理機能
 */
function showAddGameModal(gameId = null) {
    const isEdit = gameId !== null;
    const g = isEdit ? games.find(game => game.id === gameId) : {
        date: new Date().toISOString().split('T')[0],
        opponent: "", location: "", weather: "晴れ", side: "先攻"
    };

    document.getElementById('modal-title').innerText = isEdit ? "試合情報の編集" : "新規試合登録";
    document.getElementById('modal-body').innerHTML = `
        <div class="edit-form">
            <label>試合日:</label> <input type="date" id="g-date" value="${g.date}">
            <label>対戦相手:</label> <input type="text" id="g-opponent" value="${g.opponent}" placeholder="相手チーム名">
            <label>球場:</label> <input type="text" id="g-location" value="${g.location}" placeholder="球場名">
            <label>天気:</label>
            <select id="g-weather">
                <option value="晴れ" ${g.weather==='晴れ'?'selected':''}>☀️ 晴れ</option>
                <option value="曇り" ${g.weather==='曇り'?'selected':''}>☁️ 曇り</option>
                <option value="雨" ${g.weather==='雨'?'selected':''}>☔ 雨</option>
            </select>
            <label>自チーム攻守:</label>
            <select id="g-side">
                <option value="先攻" ${g.side==='先攻'?'selected':''}>先攻</option>
                <option value="後攻" ${g.side==='後攻'?'selected':''}>後攻</option>
            </select>
            <div class="modal-btns">
                <button class="btn-save" onclick="processGame(${gameId})">${isEdit ? '変更を保存する' : '試合を作成する'}</button>
            </div>
        </div>
    `;
    document.getElementById('modal-overlay').style.display = 'flex';
}

function processGame(gameId) {
    const date = document.getElementById('g-date').value;
    const opponent = document.getElementById('g-opponent').value;
    if(!date || !opponent) return alert("日付と相手名は必須です");

    const gameData = {
        id: gameId || Date.now(),
        date: date,
        opponent: opponent,
        location: document.getElementById('g-location').value || "未定",
        weather: document.getElementById('g-weather').value,
        side: document.getElementById('g-side').value,
        score: gameId ? games.find(x => x.id === gameId).score : { us: 0, them: 0 },
        innings: gameId ? games.find(x => x.id === gameId).innings : Array(9).fill().map(() => ({ us: "", them: "" })),
        lineup: gameId ? (games.find(x => x.id === gameId).lineup || []) : [],
        isFinished: gameId ? games.find(x => x.id === gameId).isFinished : false
    };

    if (gameId) {
        const index = games.findIndex(g => g.id === gameId);
        games[index] = gameData;
    } else {
        games.push(gameData);
    }
    
    saveAndRefreshGames();
    closeModal();
}

function renderGameList() {
    const container = document.getElementById('game-list-container');
    const scoreContainer = document.getElementById('score-game-list-container');
    
    if(!container) return;
    
    const emptyMsg = '<p class="empty-message">試合が登録されていません</p>';
    if(games.length === 0) {
        container.innerHTML = emptyMsg;
        if(scoreContainer) scoreContainer.innerHTML = emptyMsg;
        return;
    }

    container.innerHTML = games.map(g => {
        const resultText = g.isFinished ? (g.score.us > g.score.them ? ' (勝)' : g.score.us < g.score.them ? ' (敗)' : ' (分)') : ' (未完了)';
        const weatherIcon = g.weather === '晴れ' ? '☀️' : g.weather === '曇り' ? '☁️' : g.weather === '雨' ? '☔' : '❓';
        
        return `
            <div class="game-card">
                <div class="game-card-header">
                    <h4>vs ${g.opponent}</h4>
                    <span class="weather-icon">${weatherIcon}</span>
                </div>
                <p>📅 ${g.date} (${g.side}) | 📍 ${g.location}</p>
                <p class="score-text">スコア: ${g.score.us} - ${g.score.them}${resultText}</p>
                
                <div class="game-card-btns" style="margin-top: 15px;">
                    <button class="btn-score" style="background:#1976d2;" onclick="showLineupModal(${g.id})">スタメン・打順設定</button>
                </div>
                
                <div class="game-card-btns">
                    <button class="btn-edit-mode" onclick="showAddGameModal(${g.id})">試合情報を編集</button>
                    <button class="btn-delete" onclick="deleteGame(${g.id})">削除</button>
                </div>
            </div>`;
    }).join('');

    // 🌟 修正：「スコア入力」タブに「打席成績」ボタンを追加
    if(scoreContainer) {
        scoreContainer.innerHTML = games.map(g => {
            const weatherIcon = g.weather === '晴れ' ? '☀️' : g.weather === '曇り' ? '☁️' : g.weather === '雨' ? '☔' : '❓';
            return `
            <div class="game-card">
                <div class="game-card-header">
                    <h4>vs ${g.opponent}</h4>
                    <span class="weather-icon">${weatherIcon}</span>
                </div>
                <p>📅 ${g.date} | 📍 ${g.location}</p>
                <p class="score-text large">スコア: ${g.score.us} - ${g.score.them}</p>
                
                <div class="game-card-btns" style="margin-top: 15px;">
                    <button class="btn-score" style="background:#4caf50;" onclick="showScoreInputModal(${g.id})">スコアボード</button>
                    <button class="btn-score" style="background:#ff9800;" onclick="showAtBatMatrixModal(${g.id})">打席成績を入力</button>
                </div>
            </div>`;
        }).join('');
    }
}

/**
 * スタメン・打順登録機能
 */
function showLineupModal(gameId) {
    if (players.length === 0) return alert("先に選手登録を行ってください。");
    currentGameForScore = games.find(game => game.id === gameId);
    tempLineup = JSON.parse(JSON.stringify(currentGameForScore.lineup || []));

    if (tempLineup.length === 0) {
        for(let i=0; i<9; i++) tempLineup.push({ playerId: "", position: "", results: [] });
    }

    document.getElementById('modal-title').innerText = `スタメン設定 (vs ${currentGameForScore.opponent})`;
    document.getElementById('modal-body').innerHTML = `
        <div class="edit-form">
            <div id="lineup-wrapper"></div>
            <button class="btn-edit-mode" style="padding: 6px; font-size: 0.9rem; margin-top: 10px; background:#4caf50;" onclick="addLineupRow()">＋ 打者を追加</button>
            <div class="modal-btns">
                <button class="btn-save" onclick="saveLineup()">スタメンを保存</button>
            </div>
        </div>
    `;
    renderLineupRows();
    document.getElementById('modal-overlay').style.display = 'flex';
}

function renderLineupRows() {
    const wrapper = document.getElementById('lineup-wrapper');
    wrapper.innerHTML = "";

    tempLineup.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = "lineup-row";
        
        row.innerHTML = `
            <span class="lineup-order">${index + 1}.</span>
            <select class="lineup-player-select" onchange="updateTempLineup(${index}, 'playerId', this.value)">
                <option value="">-- 選手 --</option>
                ${players.map(p => `<option value="${p.id}" ${String(p.id) === String(item.playerId) ? 'selected' : ''}>[${p.number === "無" ? "無" : '#' + p.number}] ${p.name}</option>`).join('')}
            </select>
            <select class="lineup-pos-select" onchange="updateTempLineup(${index}, 'position', this.value)">
                <option value="">位置</option>
                ${lineupPositionOptions.map(pos => `<option value="${pos}" ${pos === item.position ? 'selected' : ''}>${pos}</option>`).join('')}
            </select>
            <button class="btn-remove-row" onclick="removeLineupRow(${index})">✖</button>
        `;
        wrapper.appendChild(row);
    });
}

function updateTempLineup(index, key, value) {
    tempLineup[index][key] = value;
}

function addLineupRow() {
    tempLineup.push({ playerId: "", position: "", results: [] });
    renderLineupRows();
}

function removeLineupRow(index) {
    tempLineup.splice(index, 1);
    renderLineupRows();
}

function saveLineup() {
    const filteredLineup = tempLineup.filter(item => item.playerId !== "");
    // データ互換性（過去データにresults配列がなければ追加）
    filteredLineup.forEach(item => { if (!item.results) item.results = []; });
    
    currentGameForScore.lineup = filteredLineup;
    saveAndRefreshGames();
    closeModal();
}

/**
 * 🌟 新規フェーズ4：打席成績（スコアブック型マトリックス）入力機能
 */
function showAtBatMatrixModal(gameId) {
    currentGameForScore = games.find(g => g.id === gameId);
    const g = currentGameForScore;

    if (!g.lineup || g.lineup.length === 0) {
        alert("先に「試合情報」タブからスタメン・打順を設定してください。");
        return;
    }

    g.lineup.forEach(item => { if (!item.results) item.results = []; });

    // 一番打席数が多い選手に合わせて表の横幅（列数）を自動調整（最低5打席）
    let maxCols = 5;
    g.lineup.forEach(item => {
        if (item.results.length >= maxCols) maxCols = item.results.length + 1;
    });
    currentAtBatColumns = maxCols;

    renderAtBatMatrix();
}

function renderAtBatMatrix() {
    const g = currentGameForScore;

    let headerHtml = `<th>順</th><th style="text-align:left;">選手</th>`;
    for(let i=0; i<currentAtBatColumns; i++) {
        headerHtml += `<th>第${i+1}打席</th>`;
    }

    let rowsHtml = g.lineup.map((item, lineIdx) => {
        const player = players.find(p => String(p.id) === String(item.playerId));
        const pName = player ? player.name : "不明";
        
        let colsHtml = "";
        for(let atBatIdx=0; atBatIdx<currentAtBatColumns; atBatIdx++) {
            const resData = item.results[atBatIdx];
            const text = resData && resData.result ? resData.result : "";
            const rbiText = resData && resData.rbi > 0 ? `<span class="rbi-text">${resData.rbi}打点</span>` : "";
            const isFilled = text !== "" ? "filled" : "";
            
            // タップすると入力画面(openAtBatInput)が開く
            colsHtml += `<td class="atbat-cell ${isFilled}" onclick="openAtBatInput(${lineIdx}, ${atBatIdx})">
                            ${text}${rbiText}
                         </td>`;
        }

        return `<tr>
            <td style="font-weight:bold; text-align:center;">${lineIdx+1}</td>
            <td class="team-name">
                ${pName}<br><span style="color:#666; font-size:0.75rem;">${item.position}</span>
            </td>
            ${colsHtml}
        </tr>`;
    }).join('');

    document.getElementById('modal-title').innerText = "打席成績の入力";
    document.getElementById('modal-body').innerHTML = `
        <div class="edit-form">
            <p style="font-weight:bold; color:var(--grass-green); font-size:1rem; margin:0;">vs ${g.opponent}</p>
            <p style="font-size: 0.8rem; color: #666; margin-bottom:10px;">入力したい打席の枠をタップしてください。</p>

            <div class="score-table-container">
                <table class="score-table atbat-table">
                    <thead><tr>${headerHtml}</tr></thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>

            <button class="btn-edit-mode" style="padding: 8px; font-size: 0.9rem;" onclick="addAtBatColumn()">＋ 右に打席列を追加</button>

            <div class="modal-btns" style="margin-top: 15px;">
                <button class="btn-save" onclick="saveAndRefreshGames(); closeModal();">閉じる（自動保存済）</button>
            </div>
        </div>
    `;
    document.getElementById('modal-overlay').style.display = 'flex';
}

function addAtBatColumn() {
    currentAtBatColumns++;
    renderAtBatMatrix();
}

function openAtBatInput(lineIdx, atBatIdx) {
    const g = currentGameForScore;
    const item = g.lineup[lineIdx];
    const player = players.find(p => String(p.id) === String(item.playerId));
    const pName = player ? player.name : "不明";

    const currentRes = item.results[atBatIdx] || { result: "", rbi: 0 };
    const resultOptions = ['', '単打', '二塁打', '三塁打', '本塁打', '四死球', '三振', '内野ゴロ', '内野フライ', '外野フライ', 'エラー出塁', '犠打・犠飛'];
    
    document.getElementById('modal-title').innerText = `第${atBatIdx+1}打席: ${pName}`;
    document.getElementById('modal-body').innerHTML = `
        <div class="edit-form">
            <label>結果:</label>
            <select id="ab-result" style="font-size:1.1rem; padding:12px;">
                ${resultOptions.map(opt => `<option value="${opt}" ${currentRes.result === opt ? 'selected' : ''}>${opt === '' ? '-- 選択してください --' : opt}</option>`).join('')}
            </select>

            <label>打点:</label>
            <select id="ab-rbi" style="font-size:1.1rem; padding:12px;">
                ${[0,1,2,3,4].map(n => `<option value="${n}" ${Number(currentRes.rbi) === n ? 'selected' : ''}>${n}</option>`).join('')}
            </select>

            <div class="modal-btns" style="margin-top:20px;">
                <button class="btn-save" onclick="saveAtBatInput(${lineIdx}, ${atBatIdx})">決定して表に戻る</button>
                <button class="btn-delete" onclick="clearAtBatInput(${lineIdx}, ${atBatIdx})">この打席を空欄にする</button>
                <button class="btn-edit-mode" style="background:#999;" onclick="renderAtBatMatrix()">キャンセル</button>
            </div>
        </div>
    `;
}

function saveAtBatInput(lineIdx, atBatIdx) {
    const res = document.getElementById('ab-result').value;
    const rbi = document.getElementById('ab-rbi').value;

    currentGameForScore.lineup[lineIdx].results[atBatIdx] = { result: res, rbi: Number(rbi) };
    saveAndRefreshGames();
    renderAtBatMatrix(); 
}

function clearAtBatInput(lineIdx, atBatIdx) {
    currentGameForScore.lineup[lineIdx].results[atBatIdx] = { result: "", rbi: 0 };
    saveAndRefreshGames();
    renderAtBatMatrix();
}

/**
 * イニングスコアボード機能（変更なし）
 */
function showScoreInputModal(gameId) {
    currentGameForScore = games.find(game => game.id === gameId);
    if (!currentGameForScore.innings) currentGameForScore.innings = Array(9).fill().map(() => ({ us: "", them: "" }));

    document.getElementById('modal-title').innerText = "イニングスコア入力";
    document.getElementById('modal-body').innerHTML = `
        <div class="edit-form">
            <p style="font-weight:bold; color:var(--grass-green); font-size:1.1rem; margin-bottom:5px;">vs ${currentGameForScore.opponent}</p>
            <div id="score-board-wrapper"></div>
            <button class="btn-edit-mode" style="padding: 6px; font-size: 0.9rem; margin-top: 10px;" onclick="addInning()">＋ イニング追加</button>
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; margin-top:15px;">
                <input type="checkbox" id="s-finished" class="chk-finished" ${currentGameForScore.isFinished ? 'checked' : ''}>
                この試合を終了とする（集計に反映）
            </label>
            <div class="modal-btns"><button class="btn-save" onclick="saveScoreBoard()">スコアを保存する</button></div>
        </div>
    `;
    renderScoreBoardTable();
    document.getElementById('modal-overlay').style.display = 'flex';
}

function renderScoreBoardTable() {
    const g = currentGameForScore;
    const headerHtml = g.innings.map((_, i) => `<th>${i + 1}</th>`).join('');
    const usHtml = g.innings.map((inning, i) => `<td><input type="number" class="score-input" value="${inning.us}" oninput="updateInningScore(${i}, 'us', this.value)"></td>`).join('');
    const themHtml = g.innings.map((inning, i) => `<td><input type="number" class="score-input" value="${inning.them}" oninput="updateInningScore(${i}, 'them', this.value)"></td>`).join('');
    let totalUs = g.innings.reduce((sum, inn) => sum + (parseInt(inn.us) || 0), 0);
    let totalThem = g.innings.reduce((sum, inn) => sum + (parseInt(inn.them) || 0), 0);

    document.getElementById('score-board-wrapper').innerHTML = `
        <div class="score-table-container">
            <table class="score-table">
                <thead><tr><th class="team-name">チーム</th>${headerHtml}<th>計</th></tr></thead>
                <tbody>
                    <tr><td class="team-name">自チーム</td>${usHtml}<td id="score-total-us" class="score-total">${totalUs}</td></tr>
                    <tr><td class="team-name">相手</td>${themHtml}<td id="score-total-them" class="score-total">${totalThem}</td></tr>
                </tbody>
            </table>
        </div>
    `;
}

function updateInningScore(index, team, value) {
    currentGameForScore.innings[index][team] = value;
    let totalUs = currentGameForScore.innings.reduce((sum, inn) => sum + (parseInt(inn.us) || 0), 0);
    let totalThem = currentGameForScore.innings.reduce((sum, inn) => sum + (parseInt(inn.them) || 0), 0);
    document.getElementById('score-total-us').innerText = totalUs;
    document.getElementById('score-total-them').innerText = totalThem;
}

function addInning() {
    currentGameForScore.innings.push({ us: "", them: "" });
    renderScoreBoardTable();
}

function saveScoreBoard() {
    const g = currentGameForScore;
    g.score.us = g.innings.reduce((sum, inn) => sum + (parseInt(inn.us) || 0), 0);
    g.score.them = g.innings.reduce((sum, inn) => sum + (parseInt(inn.them) || 0), 0);
    g.isFinished = document.getElementById('s-finished').checked;
    saveAndRefreshGames();
    updateTeamRecord();
    closeModal();
}

function deleteGame(id) {
    if(confirm("試合情報を削除しますか？")) {
        games = games.filter(g => g.id !== id);
        saveAndRefreshGames();
        updateTeamRecord();
    }
}

/**
 * 共通・集計処理
 */
function updateTeamRecord() {
    let wins = 0, losses = 0, draws = 0;
    games.filter(g => g.isFinished).forEach(g => {
        if(g.score.us > g.score.them) wins++;
        else if(g.score.us < g.score.them) losses++;
        else draws++;
    });
    const el = document.getElementById('team-record');
    if(el) el.innerText = `${wins}勝 ${losses}敗 ${draws}分`;
}

function saveAndRefreshPlayers() {
    localStorage.setItem('baseball_players', JSON.stringify(players));
    renderPlayerList();
}

function saveAndRefreshGames() {
    localStorage.setItem('baseball_games', JSON.stringify(games));
    renderGameList();
}

function closeModal() {
    const modal = document.getElementById('modal-overlay');
    if (modal) modal.style.display = 'none';
    currentEditingPlayerId = null;
    currentGameForScore = null;
}
