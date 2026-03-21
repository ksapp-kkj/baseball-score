/**
 * 🌟 Firebaseの初期設定
 */
const firebaseConfig = {
  apiKey: "AIzaSyCyCfzG-CwRS9p0KcyVPgCiYv6wBGGsIiE",
  authDomain: "baseball-score-app-cf80d.firebaseapp.com",
  projectId: "baseball-score-app-cf80d",
  storageBucket: "baseball-score-app-cf80d.firebasestorage.app",
  messagingSenderId: "186268082523",
  appId: "1:186268082523:web:8c8e466f56ec82c3cefa7e"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

/**
 * 🌟 アプリ全体の状態管理
 */
let currentUser = null;       
let currentTeamId = null;     

const positionOptions = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH"];
const lineupPositionOptions = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH", "EH", "ベンチ"];

let players = [];
let games = [];
let currentEditingPlayerId = null;
let currentGameForScore = null;
let tempLineup = []; 
let currentAtBatColumns = 5; 
let currentStatsYear = "all"; 
let currentRecordYear = "all";
let tempParticipants = [];
let tempPitchers = []; 
let isGameDeleteMode = false; 

/**
 * 🌟 画面切り替えの仕組み
 */
function showScreen(screenId) {
    document.querySelectorAll('.app-screen').forEach(sec => {
        sec.style.display = 'none';
        sec.classList.remove('active');
    });
    const target = document.getElementById(screenId);
    if(target) {
        target.style.display = 'block';
        target.classList.add('active');
    }
}

/**
 * 🌟 Firebase 認証（ログイン・ログアウト）
 */
auth.onAuthStateChanged((user) => {
    if (user) {
        currentUser = user;
        showScreen('mypage-screen');
        loadUserTeams(); 
    } else {
        currentUser = null;
        currentTeamId = null;
        showScreen('login-screen');
    }
});

async function loginWithEmail() {
    const email = document.getElementById('email-input').value;
    const password = document.getElementById('password-input').value;
    
    if(!email || !password) return alert("メールアドレスとパスワードを入力してください");
    
    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch(error) {
        if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential' || error.code === 'auth/invalid-login-credentials') {
            if(confirm("アカウントが見つかりません。入力した内容で新規登録しますか？")) {
                try {
                    await auth.createUserWithEmailAndPassword(email, password);
                    alert("新規登録が完了しました！");
                } catch(e) { 
                    alert("登録エラー: " + e.message); 
                }
            }
        } else {
            alert("エラー: " + error.message);
        }
    }
}

function logout() {
    if(confirm("ログアウトしますか？")) {
        auth.signOut();
    }
}

/**
 * 🌟 マイページ（チーム管理）機能
 */
async function loadUserTeams() {
    const listEl = document.getElementById('user-team-list');
    listEl.innerHTML = '<p class="empty-message">読み込み中...</p>';
    
    try {
        const snapshot = await db.collection("teams").where("members", "array-contains", currentUser.uid).get();
        
        if (snapshot.empty) {
            listEl.innerHTML = '<p class="empty-message">所属しているチームがありません。<br>「新しいチームを作成する」か、「招待ID」を入力してください。</p>';
            return;
        }
        
        let html = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            const isAdmin = data.admins && data.admins.includes(currentUser.uid);
            const badge = isAdmin ? '<span class="admin-badge">管理者</span>' : '';
            html += `<button class="team-select-btn" onclick="selectTeam('${doc.id}', '${data.team_name}')">${data.team_name} ${badge}</button>`;
        });
        listEl.innerHTML = html;
        
    } catch(e) {
        listEl.innerHTML = '<p class="empty-message" style="color:red;">読み込みエラーが発生しました。</p>';
        console.error(e);
    }
}

function showCreateTeamModal() {
    document.getElementById('modal-title').innerText = "新しいチームを作成";
    document.getElementById('modal-body').innerHTML = `
        <div class="edit-form">
            <input type="text" id="new-team-name" placeholder="チーム名を入力" style="font-size: 1.1rem; padding: 12px;">
            <div class="modal-btns" style="margin-top: 20px;">
                <button class="btn-save" onclick="createNewTeam()">作成する</button>
            </div>
        </div>
    `;
    document.getElementById('modal-overlay').style.display = 'flex';
}

async function createNewTeam() {
    const teamName = document.getElementById('new-team-name').value;
    if (!teamName) return alert("チーム名を入力してください");
    
    try {
        await db.collection("teams").add({
            team_name: teamName,
            manager_name: "",
            captain_name: "",
            members: [currentUser.uid], 
            admins: [currentUser.uid],  
            players: [],
            games: []
        });
        closeModal();
        loadUserTeams(); 
    } catch (e) {
        alert("作成エラー: " + e.message);
    }
}

// 🌟 今回の追加機能1：招待IDでチームに参加する
async function joinTeam() {
    const teamIdInput = document.getElementById('join-team-id');
    const teamId = teamIdInput.value.trim();
    if (!teamId) return alert("招待IDを入力してください");

    try {
        const docRef = db.collection("teams").doc(teamId);
        const doc = await docRef.get();

        if (!doc.exists) {
            return alert("入力されたIDのチームが見つかりません。IDが間違っていないか確認してください。");
        }

        // 魔法のコード「arrayUnion」を使って、名簿（members）に自分を安全に追加する
        await docRef.update({
            members: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
        });

        alert("チームに参加しました！");
        teamIdInput.value = ""; 
        loadUserTeams(); 
    } catch (error) {
        alert("参加処理中にエラーが発生しました。");
        console.error(error);
    }
}

// 🌟 今回の追加機能2：招待IDをクリップボードにコピーする
function copyTeamId() {
    if (!currentTeamId) return;
    navigator.clipboard.writeText(currentTeamId).then(() => {
        alert("招待ID「" + currentTeamId + "」をコピーしました！\nLINE等でメンバーに共有して、チームに参加してもらってください。");
    }).catch(err => {
        alert("コピーに失敗しました。このIDを手動でコピーしてください: " + currentTeamId);
    });
}

async function selectTeam(teamId, teamName) {
    currentTeamId = teamId;
    document.getElementById('current-team-display').innerText = teamName;
    
    // 🌟 ヘッダーにIDを表示させる
    document.getElementById('team-id-display').innerText = `ID: ${teamId} (タップでコピー)`;
    
    try {
        const doc = await db.collection("teams").doc(teamId).get();
        const data = doc.data();
        
        players = data.players || [];
        games = data.games || [];
        
        document.getElementById('team-name-input').value = data.team_name || teamName;
        document.getElementById('manager-name-input').value = data.manager_name || "";
        document.getElementById('captain-name-input').value = data.captain_name || "";
        
        renderPlayerList();
        renderGameList();
        updateTeamRecord();
        renderStatsPage();
        
        showScreen('main-app-screen');
    } catch(e) {
        alert("チームデータの読み込みに失敗しました");
        console.error(e);
    }
}

function backToMyPage() {
    currentTeamId = null;
    players = [];
    games = [];
    showScreen('mypage-screen');
    loadUserTeams();
}


/**
 * 起動時の処理
 */
window.onload = function() {
    setupNavigation();
    setupBackupUI();
    
    const teamFields = [
        { id: 'team-name-input', key: 'team_name' },
        { id: 'manager-name-input', key: 'manager_name' },
        { id: 'captain-name-input', key: 'captain_name' }
    ];

    teamFields.forEach(field => {
        const el = document.getElementById(field.id);
        if (el) {
            el.addEventListener('change', async (e) => {
                if (currentTeamId) {
                    await db.collection("teams").doc(currentTeamId).update({
                        [field.key]: e.target.value
                    });
                    if(field.key === 'team_name') {
                        document.getElementById('current-team-display').innerText = e.target.value;
                    }
                }
            });
        }
    });
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
            if (target === 'stats-page') renderStatsPage();
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

function convertToKatakana(str) {
    return str.replace(/[\u3041-\u3096]/g, function(match) {
        const chr = match.charCodeAt(0) + 0x60;
        return String.fromCharCode(chr);
    });
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
            <input type="text" id="p-furigana" placeholder="フリガナ (任意)" onblur="this.value = convertToKatakana(this.value)">
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
    const furigana = document.getElementById('p-furigana').value; 
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
        furigana: furigana, 
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

    const furiHtml = p.furigana ? `<p style="font-size:0.8rem; color:#666; margin:0 0 -5px 0;">${p.furigana}</p>` : '';

    document.getElementById('modal-title').innerText = "選手情報";
    document.getElementById('modal-body').innerHTML = `
        <div class="view-content">
            ${furiHtml}
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
            <label>フリガナ:</label> <input type="text" id="edit-furigana" value="${p.furigana || ''}" placeholder="フリガナ (任意)" onblur="this.value = convertToKatakana(this.value)">
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
    p.furigana = document.getElementById('edit-furigana').value; 
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
function toggleDeleteMode() {
    isGameDeleteMode = !isGameDeleteMode;
    const btn = document.getElementById('toggle-delete-btn');
    if (btn) {
        btn.innerText = isGameDeleteMode ? "完了" : "編集";
        btn.style.background = isGameDeleteMode ? "#999" : "var(--edit-color)";
    }
    renderGameList(); 
}

function showAddGameModal(gameId = null) {
    const isEdit = gameId !== null;
    
    const allPlayerIds = players.map(p => String(p.id));

    const g = isEdit ? games.find(game => game.id === gameId) : {
        date: new Date().toISOString().split('T')[0],
        opponent: "", location: "", weather: "晴れ", side: "先攻", 
        participants: allPlayerIds
    };

    tempParticipants = g.participants ? [...g.participants] : allPlayerIds;

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

            <label style="margin-top: 10px; border-top: 1px dashed #ccc; padding-top: 10px;">当日の参加者:</label>
            <p style="font-size: 0.8rem; color: #666; margin: 0 0 10px 0;">※デフォルトで全選手が登録されています。欠席者を「✖」で外してください。</p>
            
            <div style="display:flex; gap:8px;">
                <select id="g-participant-select" style="flex:1;"></select>
                <button type="button" class="btn-edit-mode" style="padding: 8px 16px; font-size: 0.9rem;" onclick="addParticipant()">追加</button>
            </div>
            <div id="g-participants-list" style="margin-top: 10px; display: flex; flex-wrap: wrap; gap: 8px;"></div>

            <div class="modal-btns" style="margin-top: 20px;">
                <button class="btn-save" onclick="processGame(${gameId})">${isEdit ? '変更を保存する' : '試合を作成する'}</button>
            </div>
        </div>
    `;
    
    renderParticipants();
    document.getElementById('modal-overlay').style.display = 'flex';
}

function renderParticipants() {
    const selectEl = document.getElementById('g-participant-select');
    const listEl = document.getElementById('g-participants-list');

    let optionsHtml = `<option value="">-- 追加する選手を選択 --</option>`;
    players.forEach(p => {
        if (!tempParticipants.includes(String(p.id))) {
            optionsHtml += `<option value="${p.id}">[${p.number === "無" ? "無" : '#' + p.number}] ${p.name}</option>`;
        }
    });
    selectEl.innerHTML = optionsHtml;

    if (tempParticipants.length === 0) {
        listEl.innerHTML = '<span style="font-size:0.85rem; color:#999;">参加者がいません</span>';
    } else {
        listEl.innerHTML = tempParticipants.map(pid => {
            const p = players.find(pl => String(pl.id) === String(pid));
            if (!p) return '';
            return `<span class="participant-badge">${p.name} <span class="participant-remove" onclick="removeParticipant('${pid}')">&times;</span></span>`;
        }).join('');
    }
}

function addParticipant() {
    const selectEl = document.getElementById('g-participant-select');
    const pid = selectEl.value;
    if (pid) {
        tempParticipants.push(String(pid));
        renderParticipants();
    }
}

function removeParticipant(pid) {
    tempParticipants = tempParticipants.filter(id => id !== String(pid));
    renderParticipants();
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
        participants: tempParticipants,
        score: gameId ? games.find(x => x.id === gameId).score : { us: 0, them: 0 },
        innings: gameId ? games.find(x => x.id === gameId).innings : Array(9).fill().map(() => ({ us: "", them: "" })),
        lineup: gameId ? (games.find(x => x.id === gameId).lineup || []) : [],
        pitchers: gameId ? (games.find(x => x.id === gameId).pitchers || []) : [], 
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

    const sortedGames = [...games].sort((a, b) => new Date(b.date) - new Date(a.date));

    container.innerHTML = sortedGames.map(g => {
        const resultText = g.isFinished ? (g.score.us > g.score.them ? ' (勝)' : g.score.us < g.score.them ? ' (敗)' : ' (分)') : ' (未完了)';
        const weatherIcon = g.weather === '晴れ' ? '☀️' : g.weather === '曇り' ? '☁️' : g.weather === '雨' ? '☔' : '❓';
        const pCount = g.participants ? g.participants.length : 0; 
        
        const deleteBtnHtml = isGameDeleteMode ? `<button class="btn-delete" style="width:100%; margin-top:8px;" onclick="deleteGame(${g.id})">この試合を削除</button>` : '';

        return `
            <div class="game-card">
                <div class="game-card-header">
                    <h4>vs ${g.opponent}</h4>
                    <span class="weather-icon">${weatherIcon}</span>
                </div>
                <p>📅 ${g.date} (${g.side}) | 📍 ${g.location} | 👥 参加: ${pCount}名</p>
                <p class="score-text">スコア: ${g.score.us} - ${g.score.them}${resultText}</p>
                
                <div class="game-card-btns" style="margin-top: 15px; display: flex; gap: 10px;">
                    <button class="btn-score" style="background:#1976d2; flex:1;" onclick="showLineupModal(${g.id})">スタメン・打順</button>
                    <button class="btn-edit-mode" style="flex:1;" onclick="showAddGameModal(${g.id})">試合情報の編集</button>
                </div>
                ${deleteBtnHtml}
            </div>`;
    }).join('');

    if(scoreContainer) {
        scoreContainer.innerHTML = sortedGames.map(g => {
            const weatherIcon = g.weather === '晴れ' ? '☀️' : g.weather === '曇り' ? '☁️' : g.weather === '雨' ? '☔' : '❓';
            return `
            <div class="game-card">
                <div class="game-card-header">
                    <h4>vs ${g.opponent}</h4>
                    <span class="weather-icon">${weatherIcon}</span>
                </div>
                <p>📅 ${g.date} | 📍 ${g.location}</p>
                <p class="score-text large">スコア: ${g.score.us} - ${g.score.them}</p>
                
                <div style="display:flex; flex-direction:column; gap:10px; margin-top:15px;">
                    <button class="btn-score" style="background:#4caf50; width:100%;" onclick="showScoreInputModal(${g.id})">イニングスコアボード</button>
                    <div style="display:flex; gap:10px;">
                        <button class="btn-score" style="background:#ff9800; flex:1;" onclick="showAtBatMatrixModal(${g.id})">打席成績</button>
                        <button class="btn-score" style="background:#673ab7; flex:1;" onclick="showPitcherModal(${g.id})">投手成績</button>
                    </div>
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
                ${players.map(p => {
                    const isSelectedElsewhere = tempLineup.some((t, i) => i !== index && String(t.playerId) === String(p.id));
                    if (isSelectedElsewhere) return ''; 
                    return `<option value="${p.id}" ${String(p.id) === String(item.playerId) ? 'selected' : ''}>[${p.number === "無" ? "無" : '#' + p.number}] ${p.name}</option>`;
                }).join('')}
            </select>
            
            <select class="lineup-pos-select" onchange="updateTempLineup(${index}, 'position', this.value)">
                <option value="">位置</option>
                ${lineupPositionOptions.map(pos => {
                    if (pos !== "EH" && pos !== "ベンチ") {
                        const isPosSelectedElsewhere = tempLineup.some((t, i) => i !== index && t.position === pos);
                        if (isPosSelectedElsewhere) return '';
                    }
                    return `<option value="${pos}" ${pos === item.position ? 'selected' : ''}>${pos}</option>`;
                }).join('')}
            </select>
            
            <button class="btn-remove-row" onclick="removeLineupRow(${index})">✖</button>
        `;
        wrapper.appendChild(row);
    });
}

function updateTempLineup(index, key, value) {
    tempLineup[index][key] = value;
    if (key === 'playerId' || key === 'position') {
        renderLineupRows();
    }
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
    filteredLineup.forEach(item => { if (!item.results) item.results = []; });
    
    currentGameForScore.lineup = filteredLineup;
    saveAndRefreshGames();
    closeModal();
}

/**
 * 投手成績入力機能
 */
function showPitcherModal(gameId) {
    currentGameForScore = games.find(g => g.id === gameId);
    if (!currentGameForScore.pitchers) currentGameForScore.pitchers = [];
    
    tempPitchers = JSON.parse(JSON.stringify(currentGameForScore.pitchers));
    
    if (tempPitchers.length === 0) {
        tempPitchers.push({ playerId: "", innings: "", outs: "0", er: "", so: "", bb: "" });
    }

    document.getElementById('modal-title').innerText = `投手成績 (vs ${currentGameForScore.opponent})`;
    document.getElementById('modal-body').innerHTML = `
        <div class="edit-form">
            <p style="font-size: 0.8rem; color: #666; margin-bottom:10px;">登板した投手の成績を入力してください。</p>
            <div id="pitcher-wrapper"></div>
            <button class="btn-edit-mode" style="padding: 6px; font-size: 0.9rem; margin-top: 10px; background:#4caf50;" onclick="addPitcherRow()">＋ 投手を登録</button>
            <div class="modal-btns">
                <button class="btn-save" onclick="savePitchers()">投手成績を保存</button>
            </div>
        </div>
    `;
    renderPitcherRows();
    document.getElementById('modal-overlay').style.display = 'flex';
}

function renderPitcherRows() {
    const wrapper = document.getElementById('pitcher-wrapper');
    wrapper.innerHTML = "";

    tempPitchers.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = "pitcher-row";
        
        row.innerHTML = `
            <div style="margin-bottom:8px; display:flex; gap:8px;">
                <select style="flex:1; padding:8px;" onchange="updatePitcher(${index}, 'playerId', this.value)">
                    <option value="">-- 投手を選択 --</option>
                    ${players.map(p => {
                        const isSelected = tempPitchers.some((t, i) => i !== index && String(t.playerId) === String(p.id));
                        if (isSelected) return ''; 
                        return `<option value="${p.id}" ${String(p.id) === String(item.playerId) ? 'selected' : ''}>[${p.number === "無" ? "無" : '#' + p.number}] ${p.name}</option>`;
                    }).join('')}
                </select>
                <button class="btn-remove-row" onclick="removePitcherRow(${index})">✖</button>
            </div>
            
            <div class="pitcher-grid">
                <div>
                    <label>投球回</label>
                    <input type="number" min="0" value="${item.innings}" placeholder="回" oninput="updatePitcher(${index}, 'innings', this.value)">
                </div>
                <div>
                    <label>アウト</label>
                    <select onchange="updatePitcher(${index}, 'outs', this.value)">
                        <option value="0" ${item.outs == 0 ? 'selected':''}>0/3</option>
                        <option value="1" ${item.outs == 1 ? 'selected':''}>1/3</option>
                        <option value="2" ${item.outs == 2 ? 'selected':''}>2/3</option>
                    </select>
                </div>
                <div>
                    <label>自責点</label>
                    <input type="number" min="0" value="${item.er}" placeholder="点" oninput="updatePitcher(${index}, 'er', this.value)">
                </div>
                <div>
                    <label>奪三振</label>
                    <input type="number" min="0" value="${item.so}" placeholder="個" oninput="updatePitcher(${index}, 'so', this.value)">
                </div>
                <div>
                    <label>四死球</label>
                    <input type="number" min="0" value="${item.bb}" placeholder="個" oninput="updatePitcher(${index}, 'bb', this.value)">
                </div>
            </div>
        `;
        wrapper.appendChild(row);
    });
}

function updatePitcher(index, key, value) {
    tempPitchers[index][key] = value;
    if (key === 'playerId') renderPitcherRows();
}

function addPitcherRow() {
    tempPitchers.push({ playerId: "", innings: "", outs: "0", er: "", so: "", bb: "" });
    renderPitcherRows();
}

function removePitcherRow(index) {
    tempPitchers.splice(index, 1);
    renderPitcherRows();
}

function savePitchers() {
    const filtered = tempPitchers.filter(item => item.playerId !== "");
    currentGameForScore.pitchers = filtered;
    saveAndRefreshGames();
    closeModal();
}

/**
 * 打席成績入力機能
 */
function showAtBatMatrixModal(gameId) {
    currentGameForScore = games.find(g => g.id === gameId);
    const g = currentGameForScore;

    if (!g.lineup || g.lineup.length === 0) {
        alert("先に「試合情報」タブからスタメン・打順を設定してください。");
        return;
    }

    g.lineup.forEach(item => { if (!item.results) item.results = []; });

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
            const stealText = resData && resData.steal > 0 ? `<span class="steal-text">${resData.steal}盗</span>` : "";
            const isFilled = text !== "" ? "filled" : "";
            
            colsHtml += `<td class="atbat-cell ${isFilled}" onclick="openAtBatInput(${lineIdx}, ${atBatIdx})">
                            ${text}${rbiText}${stealText}
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

    const currentRes = item.results[atBatIdx] || { result: "", rbi: 0, steal: 0 };
    const resultOptions = ['', '単打', '二塁打', '三塁打', '本塁打', '四死球', '三振', '内野ゴロ', '内野フライ', '外野フライ', 'エラー出塁', '犠打・犠飛'];
    
    document.getElementById('modal-title').innerText = `第${atBatIdx+1}打席: ${pName}`;
    document.getElementById('modal-body').innerHTML = `
        <div class="edit-form">
            <label>結果:</label>
            <select id="ab-result" style="font-size:1.1rem; padding:12px;">
                ${resultOptions.map(opt => `<option value="${opt}" ${currentRes.result === opt ? 'selected' : ''}>${opt === '' ? '-- 選択してください --' : opt}</option>`).join('')}
            </select>

            <div style="display:flex; gap:10px; margin-top: 10px;">
                <div style="flex:1;">
                    <label>打点:</label>
                    <select id="ab-rbi" style="font-size:1.1rem; padding:12px; width:100%;">
                        ${[0,1,2,3,4].map(n => `<option value="${n}" ${Number(currentRes.rbi) === n ? 'selected' : ''}>${n}</option>`).join('')}
                    </select>
                </div>
                <div style="flex:1;">
                    <label>盗塁:</label>
                    <select id="ab-steal" style="font-size:1.1rem; padding:12px; width:100%;">
                        ${[0,1,2,3,4].map(n => `<option value="${n}" ${Number(currentRes.steal) === n ? 'selected' : ''}>${n}</option>`).join('')}
                    </select>
                </div>
            </div>

            <div class="modal-btns" style="margin-top:20px;">
                <button class="btn-save" style="background:#1976d2;" onclick="saveAndNextAtBat(${lineIdx}, ${atBatIdx})">決定して次の打者へ ➡</button>
                <button class="btn-save" style="background:#4caf50;" onclick="saveAtBatInput(${lineIdx}, ${atBatIdx})">決定して表に戻る</button>
                <button class="btn-delete" onclick="clearAtBatInput(${lineIdx}, ${atBatIdx})">この打席を空欄にする</button>
                <button class="btn-edit-mode" style="background:#999;" onclick="renderAtBatMatrix()">キャンセル</button>
            </div>
        </div>
    `;
}

function saveAndNextAtBat(lineIdx, atBatIdx) {
    const res = document.getElementById('ab-result').value;
    const rbi = document.getElementById('ab-rbi').value;
    const steal = document.getElementById('ab-steal').value; 
    
    currentGameForScore.lineup[lineIdx].results[atBatIdx] = { result: res, rbi: Number(rbi), steal: Number(steal) };
    saveAndRefreshGames();
    
    let nextLine = lineIdx + 1;
    let nextAtBat = atBatIdx;
    
    if (nextLine >= currentGameForScore.lineup.length) {
        nextLine = 0;
        nextAtBat++;
    }
    
    if (nextAtBat >= currentAtBatColumns) {
        currentAtBatColumns++;
    }
    
    renderAtBatMatrix(); 
    openAtBatInput(nextLine, nextAtBat);
}

function saveAtBatInput(lineIdx, atBatIdx) {
    const res = document.getElementById('ab-result').value;
    const rbi = document.getElementById('ab-rbi').value;
    const steal = document.getElementById('ab-steal').value; 

    currentGameForScore.lineup[lineIdx].results[atBatIdx] = { result: res, rbi: Number(rbi), steal: Number(steal) };
    saveAndRefreshGames();
    renderAtBatMatrix(); 
}

function clearAtBatInput(lineIdx, atBatIdx) {
    currentGameForScore.lineup[lineIdx].results[atBatIdx] = { result: "", rbi: 0, steal: 0 };
    saveAndRefreshGames();
    renderAtBatMatrix();
}

/**
 * イニングスコアボード機能
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
 * 🌟 データ管理（Firebaseへ保存）
 */
async function saveAndRefreshPlayers() {
    renderPlayerList(); 
    if (currentTeamId) {
        try {
            await db.collection("teams").doc(currentTeamId).update({
                players: players
            });
        } catch(e) { console.error("選手保存エラー", e); }
    }
}

async function saveAndRefreshGames() {
    renderGameList();
    renderStatsPage(); 
    if (currentTeamId) {
        try {
            await db.collection("teams").doc(currentTeamId).update({
                games: games
            });
        } catch(e) { console.error("試合保存エラー", e); }
    }
}

/**
 * データ移行（ローカルのバックアップをクラウドへ）
 */
function setupBackupUI() {
    const teamPage = document.getElementById('team-page');
    if (!teamPage) return;

    const backupDiv = document.createElement('div');
    backupDiv.className = 'card';
    backupDiv.style.marginTop = '20px';
    backupDiv.innerHTML = `
        <h3>データ管理（クラウド連携済）</h3>
        <p style="font-size: 0.85rem; color: #666;">データは自動的にクラウドに保存されています。過去にJSON形式で書き出したデータをこのチームに流し込む場合は「復元」を押してください。</p>
        <div style="display: flex; gap: 10px; margin-top: 15px;">
            <button class="btn-score" style="background:#1976d2; flex: 1; padding: 10px; font-size: 0.9rem;" onclick="exportData()">📥 今のデータを書き出す</button>
            <label class="btn-edit-mode" style="background:#ff9800; flex: 1; text-align: center; cursor: pointer; padding: 10px; font-size: 0.9rem; border-radius: 8px; color: white; font-weight: bold;">
                📤 過去のデータを復元
                <input type="file" accept=".json" style="display: none;" onchange="importData(event)">
            </label>
        </div>
    `;
    teamPage.appendChild(backupDiv);
}

function exportData() {
    const data = {
        players: JSON.stringify(players),
        games: JSON.stringify(games),
        team_name: document.getElementById('team-name-input').value,
        manager_name: document.getElementById('manager-name-input').value,
        captain_name: document.getElementById('captain-name-input').value
    };
    const jsonStr = JSON.stringify(data);
    const blob = new Blob([jsonStr], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `baseball_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if(!confirm("現在のチームデータがすべて上書きされます。復元を実行してもよろしいですか？")) {
        event.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = JSON.parse(e.target.result);
            
            if (data.players) players = JSON.parse(data.players);
            if (data.games) games = JSON.parse(data.games);
            const newTeamName = data.team_name || document.getElementById('team-name-input').value;
            const newManagerName = data.manager_name || document.getElementById('manager-name-input').value;
            const newCaptainName = data.captain_name || document.getElementById('captain-name-input').value;

            if (currentTeamId) {
                await db.collection("teams").doc(currentTeamId).update({
                    players: players,
                    games: games,
                    team_name: newTeamName,
                    manager_name: newManagerName,
                    captain_name: newCaptainName
                });
            }
            
            alert('クラウドへのデータの復元が完了しました！');
            selectTeam(currentTeamId, newTeamName);
        } catch (error) {
            alert('ファイルの読み込みに失敗しました。');
            console.error(error);
        }
    };
    reader.readAsText(file);
}

/**
 * 使い方モーダルの表示
 */
function showHelpModal(pageId) {
    const helpData = {
        team: {
            title: "チーム情報の使い方",
            content: `
                <div class="help-content-modal">
                    <p>・チームの基本情報と、所属する<strong>選手の名簿</strong>を管理します。</p>
                    <p>・「選手登録」からメンバーを追加してください（背番号の重複はできません）。</p>
                </div>`
        },
        game: {
            title: "試合管理の使い方",
            content: `
                <div class="help-content-modal">
                    <p>・試合のスケジュールと<strong>当日のスタメン</strong>を登録します。</p>
                    <p>・まずは「新規試合登録」から、対戦相手や<strong>当日の参加者</strong>を登録してください（欠席者を✖で外します）。</p>
                    <p>・次に、青い「スタメン・打順」ボタンを押してオーダーを組みます。</p>
                    <p>・試合を削除したい時は、右上の「編集」ボタンを押すと削除ボタンが現れます。</p>
                </div>`
        },
        score: {
            title: "スコア入力の使い方",
            content: `
                <div class="help-content-modal">
                    <p>・試合中の<strong>結果入力（スコアブック）</strong>を行うページです。</p>
                    <p>・<strong>打席成績：</strong>表のマス目をタップして、打席ごとの結果（安打・打点・盗塁など）を入力します。</p>
                    <p>・<strong>投手成績：</strong>登板した投手の投球回や自責点を入力します。</p>
                    <p>・試合が終わったら「イニングスコアボード」を開き、<strong>『この試合を終了とする（集計に反映）』にチェックを入れて保存</strong>してください。これで成績に反映されます。</p>
                </div>`
        },
        stats: {
            title: "成績表示の使い方",
            content: `
                <div class="help-content-modal">
                    <p>・「終了済（集計に反映）」になった試合のデータから、<strong>個人の打撃成績と投手成績を自動で計算</strong>して表示します。</p>
                    <p>・「表示シーズン」のプルダウンを切り替えることで、<strong>年度ごとの成績</strong>に絞り込んで確認することができます。</p>
                </div>`
        }
    };

    const data = helpData[pageId];
    if (!data) return;

    document.getElementById('modal-title').innerText = data.title;
    document.getElementById('modal-body').innerHTML = data.content;
    document.getElementById('modal-overlay').style.display = 'flex';
}

/**
 * チーム成績・個人成績の集計
 */
function updateTeamRecord() {
    const el = document.getElementById('team-record');
    if(!el) return;

    const finishedGames = games.filter(g => g.isFinished);
    const years = [...new Set(finishedGames.map(g => g.date.substring(0, 4)))].sort((a, b) => b - a);

    let selectEl = document.getElementById('record-year-select');
    if (!selectEl) {
        selectEl = document.createElement('select');
        selectEl.id = 'record-year-select';
        selectEl.style.margin = '0 auto 10px auto';
        selectEl.style.display = 'block';
        selectEl.style.width = '150px';
        selectEl.style.padding = '8px';
        selectEl.style.borderRadius = '6px';
        selectEl.style.border = '1px solid #ddd';
        selectEl.onchange = function() {
            currentRecordYear = this.value;
            updateTeamRecord();
        };
        el.parentNode.insertBefore(selectEl, el);
    }

    selectEl.innerHTML = `<option value="all" ${currentRecordYear==='all'?'selected':''}>通算成績</option>` +
        years.map(y => `<option value="${y}" ${currentRecordYear===String(y)?'selected':''}>${y}年度</option>`).join('');

    let wins = 0, losses = 0, draws = 0;
    finishedGames.forEach(g => {
        if(currentRecordYear !== "all" && g.date.substring(0, 4) !== currentRecordYear) return;
        if(g.score.us > g.score.them) wins++;
        else if(g.score.us < g.score.them) losses++;
        else draws++;
    });
    
    el.innerText = `${wins}勝 ${losses}敗 ${draws}分`;
}

function changeStatsYear(year) {
    currentStatsYear = year;
    renderStatsPage();
}

function renderStatsPage() {
    const statsContainer = document.querySelector('#stats-page .card');
    if (!statsContainer) return;

    const finishedGames = games.filter(g => g.isFinished);
    const years = [...new Set(finishedGames.map(g => g.date.substring(0, 4)))].sort((a, b) => b - a);

    let yearOptionsHtml = `<option value="all" ${currentStatsYear === 'all' ? 'selected' : ''}>通算成績</option>`;
    years.forEach(y => {
        yearOptionsHtml += `<option value="${y}" ${currentStatsYear === String(y) ? 'selected' : ''}>${y}年度</option>`;
    });

    const filterHtml = `
        <div style="margin-bottom: 15px; display: flex; align-items: center; gap: 10px;">
            <label style="font-weight: bold; color: var(--grass-green);">表示シーズン:</label>
            <select id="stats-year-select" style="width: auto; padding: 8px; font-size: 1rem; flex: 1;" onchange="changeStatsYear(this.value)">
                ${yearOptionsHtml}
            </select>
        </div>
    `;

    const targetGames = finishedGames.filter(g => {
        if (currentStatsYear === "all") return true;
        return g.date.substring(0, 4) === currentStatsYear;
    });

    const playerStats = {};
    const pitcherStats = {};
    players.forEach(p => {
        playerStats[p.id] = {
            name: p.name, number: p.number === "無" ? "-" : p.number,
            games: 0, pa: 0, ab: 0, hits: 0, hr: 0, rbi: 0, sb: 0, bb: 0, so: 0
        };
        pitcherStats[p.id] = {
            name: p.name, number: p.number === "無" ? "-" : p.number,
            games: 0, outs: 0, er: 0, so: 0, bb: 0
        };
    });

    targetGames.forEach(g => {
        if (g.lineup) {
            g.lineup.forEach(item => {
                const pid = item.playerId;
                if (!pid || !playerStats[pid]) return;
                let playedInGame = false;
                item.results.forEach(res => {
                    if (!res || !res.result) return;
                    playedInGame = true;
                    playerStats[pid].pa++; 
                    playerStats[pid].rbi += (res.rbi || 0); 
                    playerStats[pid].sb += (res.steal || 0);

                    const r = res.result;
                    if (['単打', '二塁打', '三塁打', '本塁打'].includes(r)) {
                        playerStats[pid].ab++; 
                        playerStats[pid].hits++; 
                        if (r === '本塁打') playerStats[pid].hr++;
                    } else if (['三振', '内野ゴロ', '内野フライ', '外野フライ', 'エラー出塁'].includes(r)) {
                        playerStats[pid].ab++; 
                        if (r === '三振') playerStats[pid].so++;
                    } else if (r === '四死球') {
                        playerStats[pid].bb++; 
                    }
                });
                if (playedInGame) playerStats[pid].games++; 
            });
        }
        
        if (g.pitchers) {
            g.pitchers.forEach(item => {
                const pid = item.playerId;
                if (!pid || !pitcherStats[pid]) return;
                
                pitcherStats[pid].games++;
                const totalOuts = (parseInt(item.innings) || 0) * 3 + (parseInt(item.outs) || 0);
                pitcherStats[pid].outs += totalOuts;
                pitcherStats[pid].er += (parseInt(item.er) || 0);
                pitcherStats[pid].so += (parseInt(item.so) || 0);
                pitcherStats[pid].bb += (parseInt(item.bb) || 0);
            });
        }
    });

    let bStatsArray = Object.values(playerStats).map(s => {
        if (s.ab > 0) {
            let avgNum = s.hits / s.ab;
            s.avg = avgNum === 1 ? "1.000" : avgNum.toFixed(3).replace(/^0\./, '.'); 
        } else {
            s.avg = ".000";
        }
        return s;
    });

    let pStatsArray = Object.values(pitcherStats).map(s => {
        let innFull = Math.floor(s.outs / 3);
        let innRem = s.outs % 3;
        s.ipDisplay = innRem > 0 ? `${innFull} ${innRem}/3` : `${innFull}`;

        if (s.outs > 0) {
            s.era = ((s.er * 7 * 3) / s.outs).toFixed(2);
        } else {
            s.era = "-";
        }
        return s;
    });

    if (currentStatsYear !== "all") {
        bStatsArray = bStatsArray.filter(s => s.games > 0);
        pStatsArray = pStatsArray.filter(s => s.games > 0);
    } else {
        bStatsArray = bStatsArray.filter(s => s.pa > 0 || s.games > 0);
        pStatsArray = pStatsArray.filter(s => s.outs > 0 || s.games > 0);
    }

    bStatsArray.sort((a, b) => {
        const avgA = parseFloat(a.avg) || 0;
        const avgB = parseFloat(b.avg) || 0;
        if (avgB !== avgA) return avgB - avgA;
        return b.pa - a.pa;
    });

    pStatsArray.sort((a, b) => {
        const eraA = a.era === "-" ? 999 : parseFloat(a.era);
        const eraB = b.era === "-" ? 999 : parseFloat(b.era);
        return eraA - eraB;
    });

    let html = filterHtml;

    html += `<h3 style="color:var(--grass-green); margin-top:10px;">打撃成績</h3>`;
    html += `
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>背番</th>
                        <th style="text-align:left;">氏名</th>
                        <th>打率</th>
                        <th>試合</th>
                        <th>打席</th>
                        <th>打数</th>
                        <th>安打</th>
                        <th>本塁打</th>
                        <th>打点</th>
                        <th>盗塁</th>
                        <th>四死球</th>
                        <th>三振</th>
                    </tr>
                </thead>
                <tbody>
                    ${bStatsArray.map(s => `
                        <tr>
                            <td>${s.number}</td>
                            <td style="text-align:left; font-weight:bold;">${s.name}</td>
                            <td style="font-weight:bold; color:var(--grass-green); font-size:1.1rem;">${s.avg}</td>
                            <td>${s.games}</td>
                            <td>${s.pa}</td>
                            <td>${s.ab}</td>
                            <td>${s.hits}</td>
                            <td>${s.hr}</td>
                            <td>${s.rbi}</td>
                            <td>${s.sb}</td>
                            <td>${s.bb}</td>
                            <td>${s.so}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;

    html += `<h3 style="color:var(--grass-green); margin-top:25px;">投手成績</h3>`;
    if (pStatsArray.length === 0) {
        html += `<p style="font-size:0.85rem; color:#666;">投手記録がありません。</p>`;
    } else {
        html += `
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>背番</th>
                            <th style="text-align:left;">氏名</th>
                            <th>防御率</th>
                            <th>登板</th>
                            <th>投球回</th>
                            <th>自責点</th>
                            <th>奪三振</th>
                            <th>四死球</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${pStatsArray.map(s => `
                            <tr>
                                <td>${s.number}</td>
                                <td style="text-align:left; font-weight:bold;">${s.name}</td>
                                <td style="font-weight:bold; color:#1976d2; font-size:1.1rem;">${s.era}</td>
                                <td>${s.games}</td>
                                <td>${s.ipDisplay}</td>
                                <td>${s.er}</td>
                                <td>${s.so}</td>
                                <td>${s.bb}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    statsContainer.innerHTML = html;
}

function closeModal() {
    const modal = document.getElementById('modal-overlay');
    if (modal) modal.style.display = 'none';
    currentEditingPlayerId = null;
    currentGameForScore = null;
}
