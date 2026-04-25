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
auth.languageCode = 'ja';

/**
 * 🌟 アプリ全体の状態管理
 */
let currentUser = null;       
let currentTeamId = null;
let currentTeamAdmins = [];

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
let currentGameYear = "all"; 
let tempParticipants = [];
let tempPitchers = []; 
let isGameDeleteMode = false; 
let unsubscribeTeamSnapshot = null; 

/**
 * 🌟 画面切り替えの仕組み
 */
function showScreen(screenId) {
    document.querySelectorAll('.app-screen').forEach(sec => {
        sec.classList.remove('active');
    });
    const target = document.getElementById(screenId);
    if(target) {
        target.classList.add('active');
    }
}

function showRegisterForm() {
    document.getElementById('login-form-container').classList.add('hidden');
    document.getElementById('register-form-container').classList.remove('hidden');
}

function showLoginForm() {
    document.getElementById('register-form-container').classList.add('hidden');
    document.getElementById('login-form-container').classList.remove('hidden');
}

/**
 * 🌟 onAuthStateChanged 
 */
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        const uDoc = await db.collection("users").doc(user.uid).get();
        if (uDoc.exists && uDoc.data().name) {
            document.getElementById('edit-username-input').value = uDoc.data().name;
        } else {
            document.getElementById('edit-username-input').value = "";
        }
        showScreen('mypage-screen');
        loadUserTeams(); 
    } else {
        if (unsubscribeTeamSnapshot) {
            unsubscribeTeamSnapshot();
            unsubscribeTeamSnapshot = null;
        }
        
        currentUser = null;
        currentTeamId = null;
        currentTeamAdmins = [];
        showScreen('login-screen');
    }
});

/**
 * 🌟 ログイン処理
 */
async function loginAccount() {
    const email = document.getElementById('login-email-input').value;
    const password = document.getElementById('login-password-input').value;
    if(!email || !password) return alert("メールアドレスとパスワードを入力してください");
    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch(error) {
        if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential' || error.code === 'auth/invalid-login-credentials') {
            alert("アカウントが見つからないか、パスワードが間違っています。\n初めての方は「新規アカウント登録」から登録してください。");
        } else {
            alert("ログインエラー: " + error.message);
        }
    }
}

/**
 * 🌟 新規登録処理
 */
async function registerAccount() {
    const email = document.getElementById('register-email-input').value;
    const password = document.getElementById('register-password-input').value;
    const userNameInput = document.getElementById('register-name-input').value;
    if(!email || !password) return alert("登録するメールアドレスとパスワードを入力してください");
    if(!userNameInput.trim()) return alert("表示名（ニックネーム）を入力してください");
    const userName = userNameInput.trim();
    try {
        const userCred = await auth.createUserWithEmailAndPassword(email, password);
        await db.collection("users").doc(userCred.user.uid).set({ email: email, name: userName }, { merge: true });
        alert("新規登録が完了しました！");
        document.getElementById('register-email-input').value = "";
        document.getElementById('register-password-input').value = "";
        document.getElementById('register-name-input').value = "";
    } catch(error) {
        if (error.code === 'auth/email-already-in-use') {
            alert("このメールアドレスは既に登録されています。「ログイン画面に戻る」を押してログインしてください。");
        } else {
            alert("登録エラー: " + error.message);
        }
    }
}

async function resetPassword() {
    const currentEmail = document.getElementById('login-email-input').value;
    const email = prompt("登録したメールアドレスを入力してください。\nパスワード再設定用のメールを送信します。", currentEmail);
    if (!email) return;
    try {
        await auth.sendPasswordResetEmail(email);
        alert("パスワード再設定メールを送信しました！\nメール内のリンクから新しいパスワードを設定してください。");
    } catch (e) { alert("エラーが発生しました。\n" + e.message); }
}

function logout() {
    if(confirm("ログアウトしますか？")) auth.signOut();
}

async function deleteAccount() {
    if (!confirm("⚠️本当にアカウントを完全に削除しますか？\nこの操作は取り消せません。\n（※チームの試合データ自体は消えませんが、あなたのユーザー情報は完全に削除されます）")) return;
    try {
        const uid = currentUser.uid;
        const teamsSnapshot = await db.collection("teams").where("members", "array-contains", uid).get();
        const batch = db.batch(); 
        teamsSnapshot.forEach(doc => {
            batch.update(doc.ref, {
                members: firebase.firestore.FieldValue.arrayRemove(uid),
                admins: firebase.firestore.FieldValue.arrayRemove(uid)
            });
        });
        await batch.commit(); 
        await db.collection("users").doc(uid).delete();
        await currentUser.delete();
        alert("アカウントと関連データを完全に削除しました。ご利用ありがとうございました。");
    } catch (error) {
        if (error.code === 'auth/requires-recent-login') alert("🔒 セキュリティのため、アカウントを削除するには「一度ログアウトし、再度ログイン」し直してからすぐに実行してください。");
        else alert("エラーが発生しました: " + error.message);
    }
}

async function updateUserName() {
    const newName = document.getElementById('edit-username-input').value.trim();
    if (!newName) return alert("表示名を入力してください");
    try {
        await db.collection("users").doc(currentUser.uid).update({ name: newName });
        alert("表示名を更新しました！");
    } catch (e) { alert("更新に失敗しました: " + e.message); }
}

function checkAdmin() {
    if (!currentTeamAdmins.includes(currentUser.uid)) {
        alert("【閲覧専用モード】\nデータの追加・編集・削除には「管理者権限」が必要です。\nチームの作成者（監督）に権限の付与を依頼してください。");
        return false;
    }
    return true;
}

/**
 * 🌟 マイページ（チーム管理）
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
            const admins = data.admins || [];
            const ownerUid = data.owner || admins[0];
            const isGM = (currentUser.uid === ownerUid);
            const isAdmin = admins.includes(currentUser.uid);
            let badge = '';
            if (isGM) { badge = '<span class="admin-badge bg-danger">GM</span>'; } 
            else if (isAdmin) { badge = '<span class="admin-badge admin-badge-orange">管理者</span>'; }
            html += `
                <div class="team-item-wrapper">
                    <button class="team-select-btn team-select-btn-flex" onclick="selectTeam('${doc.id}', '${data.team_name}')">${data.team_name} ${badge}</button>
                    <button class="btn-small-action bg-gray btn-leave" onclick="leaveTeam('${doc.id}', '${data.team_name}')">退出</button>
                </div>
            `;
        });
        listEl.innerHTML = html;
    } catch(e) {
        listEl.innerHTML = '<p class="empty-message" style="color:red;">読み込みエラーが発生しました。</p>';
        console.error(e);
    }
}

async function leaveTeam(teamId, teamName) {
    if(!confirm(`本当に「${teamName}」から退出しますか？\n退出すると、再度招待IDを入力しない限りこのチームには戻れません。`)) return;
    try {
        const docRef = db.collection("teams").doc(teamId);
        const docSnap = await docRef.get();
        if (docSnap.exists) {
            const data = docSnap.data();
            const admins = data.admins || [];
            const ownerUid = data.owner || admins[0]; 
            if (currentUser.uid === ownerUid) return alert("【退出できません】\nあなたはチームの「GM」です。\nGMが退出することはできません。");
            await docRef.update({
                members: firebase.firestore.FieldValue.arrayRemove(currentUser.uid),
                admins: firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
            });
            alert("チームから退出しました。");
            if (currentTeamId === teamId) backToMyPage();
            else loadUserTeams(); 
        }
    } catch(e) { alert("退出処理中にエラーが発生しました。: " + e.message); console.error(e); }
}

function showCreateTeamModal() {
    document.getElementById('modal-title').innerText = "新しいチームを作成";
    document.getElementById('modal-body').innerHTML = `
        <div class="edit-form">
            <input type="text" id="new-team-name" class="large-select w-100" placeholder="チーム名を入力">
            <div class="modal-btns mt-20">
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
            team_name: teamName, manager_name: "", captain_name: "",
            owner: currentUser.uid, members: [currentUser.uid], admins: [currentUser.uid],  
            players: [], games: []
        });
        closeModal();
        loadUserTeams(); 
    } catch (e) { alert("作成エラー: " + e.message); }
}

async function joinTeam() {
    const teamIdInput = document.getElementById('join-team-id');
    const teamId = teamIdInput.value.trim();
    if (!teamId) return alert("招待IDを入力してください");
    try {
        const docRef = db.collection("teams").doc(teamId);
        const doc = await docRef.get();
        if (!doc.exists) return alert("入力されたIDのチームが見つかりません。IDが間違っていないか確認してください。");
        await docRef.update({ members: firebase.firestore.FieldValue.arrayUnion(currentUser.uid) });
        alert("チームに参加しました！");
        teamIdInput.value = ""; 
        loadUserTeams(); 
    } catch (error) { alert("参加処理中にエラーが発生しました。"); console.error(error); }
}

function copyTeamId() {
    if (!currentTeamId) return;
    navigator.clipboard.writeText(currentTeamId).then(() => {
        alert("招待ID「" + currentTeamId + "」をコピーしました！\nLINE等でメンバーに共有して、チームに参加してもらってください。");
    }).catch(err => { alert("コピーに失敗しました。このIDを手動でコピーしてください: " + currentTeamId); });
}

async function selectTeam(teamId, teamName) {
    currentTeamId = teamId;
    document.getElementById('current-team-display').innerText = teamName;
    const idDisplay = document.getElementById('team-id-display');
    if (idDisplay) {
        idDisplay.innerHTML = `<span class="team-id-text">${teamId}</span><br><span class="team-id-subtext">(タップでコピー)</span>`;
    }

    if (unsubscribeTeamSnapshot) {
        unsubscribeTeamSnapshot();
    }

    unsubscribeTeamSnapshot = db.collection("teams").doc(teamId).onSnapshot((doc) => {
        if (doc.exists) {
            const data = doc.data();
            currentTeamAdmins = data.admins || [];
            const appScreen = document.getElementById('main-app-screen');
            const modalOverlay = document.getElementById('modal-overlay');
            const manageBtn = document.getElementById('manage-members-btn');

            if(currentTeamAdmins.includes(currentUser.uid)){
                appScreen.classList.remove('viewer-mode');
                modalOverlay.classList.remove('viewer-mode');
                if(manageBtn) manageBtn.classList.remove('hidden');
            } else {
                appScreen.classList.add('viewer-mode');
                modalOverlay.classList.add('viewer-mode');
                if(manageBtn) manageBtn.classList.add('hidden');
            }

            players = data.players || [];
            games = data.games || [];
            document.getElementById('team-name-input').value = data.team_name || teamName;
            document.getElementById('manager-name-input').value = data.manager_name || "";
            document.getElementById('captain-name-input').value = data.captain_name || "";

            if (currentGameForScore) {
                const updatedGame = games.find(g => g.id === currentGameForScore.id);
                if (updatedGame) {
                    currentGameForScore = updatedGame; 
                }
            }

            renderPlayerList();
            renderGameList();
            updateTeamRecord();
            renderStatsPage();
            showScreen('main-app-screen');
        }
    }, (error) => {
        console.error("リアルタイム同期エラー:", error);
        alert("最新データの取得に失敗しました。");
    });
}

function backToMyPage() {
    if (unsubscribeTeamSnapshot) {
        unsubscribeTeamSnapshot();
        unsubscribeTeamSnapshot = null;
    }
    
    currentTeamId = null;
    currentTeamAdmins = [];
    players = []; games = [];
    showScreen('mypage-screen');
    loadUserTeams();
}

/**
 * 🌟 メンバー・権限管理機能
 */
async function showMemberManagementModal() {
    if (!currentTeamId) return;
    document.getElementById('modal-title').innerText = "メンバー情報取得中...";
    document.getElementById('modal-overlay').style.display = 'flex';
    try {
        const doc = await db.collection("teams").doc(currentTeamId).get();
        const teamData = doc.data();
        const members = teamData.members || [];
        const admins = teamData.admins || [];
        const ownerUid = teamData.owner || admins[0];
        const iAmGM = (currentUser.uid === ownerUid); 
        let memberListHtml = '';
        for (let uid of members) {
            let displayName = "未設定"; 
            try {
                const uDoc = await db.collection("users").doc(uid).get();
                if(uDoc.exists) {
                    const d = uDoc.data();
                    displayName = (d.name && d.name !== "") ? d.name : "未設定";
                }
            } catch(e){}
            const isThisUserGM = (uid === ownerUid); 
            const isAdmin = admins.includes(uid);
            const nameClass = displayName === "未設定" ? "text-unregistered" : "";
            let actionHtml = ''; let badgeHtml = '';

            if (isThisUserGM) badgeHtml = '<span class="admin-badge bg-danger badge-gm">GM</span>';
            else if (isAdmin) badgeHtml = '<span class="admin-badge admin-badge-orange">管理者</span>';
            else badgeHtml = '<span class="viewer-badge">閲覧のみ</span>';

            if (isThisUserGM) {
                actionHtml = `<span class="admin-note">※最高権限</span>`;
            } else {
                if (isAdmin) actionHtml += `<button class="btn-small-action btn-small-gray" onclick="toggleAdmin('${uid}', false)">管理者を外す</button>`;
                else actionHtml += `<button class="btn-small-action btn-small-blue" onclick="toggleAdmin('${uid}', true)">管理者にする</button>`;
                if (iAmGM) actionHtml += `<button class="btn-small-action bg-danger ml-8" onclick="transferGM('${uid}', '${displayName}')">GMを譲渡</button>`;
            }
            memberListHtml += `
                <div class="member-list-item">
                    <div>
                        <div class="member-name-text ${nameClass}">${displayName}</div>
                        ${badgeHtml}
                    </div>
                    <div class="flex-gap-8">${actionHtml}</div>
                </div>
            `;
        }
        document.getElementById('modal-title').innerText = "チームメンバーと権限の管理";
        document.getElementById('modal-body').innerHTML = `
            <div class="edit-form">
                <p class="help-text mb-15">管理者はGMを含めて【最大5人】までです。GMは任意のメンバーに権限を譲渡できます。</p>
                <div class="member-scroll-container">${memberListHtml}</div>
                <div class="modal-btns"><button class="btn-save" onclick="closeModal()">閉じる</button></div>
            </div>
        `;
    } catch(e) { alert("メンバー情報の取得に失敗しました。"); closeModal(); }
}

async function toggleAdmin(uid, makeAdmin) {
    try {
        const docRef = db.collection("teams").doc(currentTeamId);
        if (makeAdmin) {
            const docSnap = await docRef.get();
            const currentAdmins = docSnap.data().admins || [];
            if (currentAdmins.length >= 5) return alert("【上限エラー】\n管理者はGMを含めて最大5人までです。これ以上追加できません。");
            if(!confirm("このメンバーを管理者にしますか？")) return;
            await docRef.update({ admins: firebase.firestore.FieldValue.arrayUnion(uid) });
        } else {
            if(!confirm("このメンバーから管理者権限を外しますか？（閲覧のみになります）")) return;
            await docRef.update({ admins: firebase.firestore.FieldValue.arrayRemove(uid) });
        }
        showMemberManagementModal();
    } catch(e) { alert("権限の変更に失敗しました。"); console.error(e); }
}

async function transferGM(uid, displayName) {
    if(!confirm(`本当に「${displayName}」さんにGM（最高権限）を譲渡しますか？\n※あなた自身は通常の管理者に戻ります。`)) return;
    try {
        const docRef = db.collection("teams").doc(currentTeamId);
        await docRef.update({ owner: uid, admins: firebase.firestore.FieldValue.arrayUnion(uid) });
        alert(`GM権限を「${displayName}」さんに移管しました。`);
        showMemberManagementModal();
    } catch(e) { alert("GMの譲渡に失敗しました。"); console.error(e); }
}

window.onload = function() {
    setupNavigation();
    const teamFields = [
        { id: 'team-name-input', key: 'team_name' },
        { id: 'manager-name-input', key: 'manager_name' },
        { id: 'captain-name-input', key: 'captain_name' }
    ];
    teamFields.forEach(field => {
        const el = document.getElementById(field.id);
        if (el) {
            el.addEventListener('change', async (e) => {
                if (!checkAdmin()) { e.target.value = e.target.defaultValue; return; }
                if (currentTeamId) {
                    await db.collection("teams").doc(currentTeamId).update({ [field.key]: e.target.value });
                    if(field.key === 'team_name') document.getElementById('current-team-display').innerText = e.target.value;
                    e.target.defaultValue = e.target.value;
                }
            });
        }
    });
};

function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.content-section');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const target = item.getAttribute('data-target');
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            sections.forEach(sec => { sec.classList.toggle('active', sec.id === target); });
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
    for (let i = 100; i <= 999; i++) { if (!usedNumbers.has(i)) return i; }
    return 100;
}

function formatNumberInput(inputEl) {
    if (!inputEl.value) return;
    let val = inputEl.value;
    val = val.replace(/[０-９]/g, function(s) { return String.fromCharCode(s.charCodeAt(0) - 0xFEE0); });
    val = val.replace(/[^0-9]/g, '');
    inputEl.value = val;
}

function convertToKatakana(str) {
    return str.replace(/[\u3041-\u3096]/g, function(match) { return String.fromCharCode(match.charCodeAt(0) + 0x60); });
}

/**
 * 🌟 選手情報管理
 */
function showAddPlayerModal() {
    document.getElementById('modal-title').innerText = "選手登録";
    const subPosHtml = positionOptions.map(pos => `
        <label class="checkbox-item"><input type="checkbox" name="sub-pos" value="${pos}"> ${pos}</label>
    `).join('');
    const suggestedNum = getSuggestedAssistantNumber();
    document.getElementById('modal-body').innerHTML = `
        <div class="edit-form">
            <input type="text" inputmode="numeric" id="p-number" placeholder="背番号 (助っ人候補: ${suggestedNum})" oninput="formatNumberInput(this)">
            
            <div class="flex-gap-8">
                <input type="text" id="p-name-last" class="flex-1" placeholder="苗字">
                <input type="text" id="p-name-first" class="flex-1" placeholder="名前">
            </div>

            <div class="flex-gap-8">
                <input type="text" id="p-furigana-last" class="flex-1" placeholder="フリガナ(苗字)" onblur="this.value = convertToKatakana(this.value)">
                <input type="text" id="p-furigana-first" class="flex-1" placeholder="フリガナ(名前)" onblur="this.value = convertToKatakana(this.value)">
            </div>

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
            <div class="modal-btns"><button class="btn-save admin-only" onclick="addPlayer()">登録する</button></div>
        </div>
    `;
    document.getElementById('modal-overlay').style.display = 'flex';
}

function addPlayer() {
    if (!checkAdmin()) return;
    
    const lastName = document.getElementById('p-name-last').value.trim();
    const firstName = document.getElementById('p-name-first').value.trim();
    if(!lastName || !firstName) return alert("苗字と名前を両方入力してください");
    const fullName = lastName + " " + firstName;

    const furiLast = document.getElementById('p-furigana-last').value.trim();
    const furiFirst = document.getElementById('p-furigana-first').value.trim();
    let furigana = "";
    if (furiLast || furiFirst) {
        furigana = (furiLast + " " + furiFirst).trim();
        if (!/^[ァ-ヶー・\s　]+$/.test(furigana)) {
            return alert("エラー：フリガナは「全角カタカナ」のみ入力してください。");
        }
    }

    const mainPos = document.getElementById('p-main-pos').value;
    let numInput = document.getElementById('p-number').value;
    if(!mainPos) return alert("メイン守備を選択してください");

    numInput = numInput.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).replace(/[^0-9]/g, '');
    const numberToSave = numInput === "" ? "無" : String(numInput);

    if (numberToSave !== "無") {
        const isDuplicate = players.some(p => (p.status || "現役") === "現役" && String(p.number) === numberToSave);
        if (isDuplicate) return alert(`エラー：背番号「${numberToSave}」は既に現役選手が使用中です。`);
    }

    const uniqueId = Date.now().toString() + Math.random().toString(36).substring(2, 9);

    players.push({
        id: uniqueId,
        number: numberToSave,
        pastNumbers: [],
        name: fullName,      
        furigana: furigana,  
        side: document.getElementById('p-side').value,
        mainPos: mainPos,
        subPos: Array.from(document.querySelectorAll('input[name="sub-pos"]:checked')).map(cb => cb.value),
        status: "現役", 
        stats: { avg: ".000", hits: 0, ab: 0 }
    });
    
    saveAndRefreshPlayers();
    closeModal();
}

function showPlayerDetail(id) {
    const p = players.find(player => String(player.id) === String(id));
    if(!p) return;
    currentEditingPlayerId = String(id);
    const furiHtml = p.furigana ? `<p class="player-furigana">${p.furigana}</p>` : '';
    const statusText = p.status || '現役';

    document.getElementById('modal-title').innerText = "選手情報";
    document.getElementById('modal-body').innerHTML = `
        <div class="view-content">
            ${furiHtml}
            <p><strong>氏名:</strong> ${p.name}</p>
            <p><strong>背番号:</strong> ${p.number}</p>
            <p><strong>投打:</strong> ${p.side}</p>
            <p><strong>メイン守備:</strong> ${p.mainPos}</p>
            <p><strong>サブ守備:</strong> ${p.subPos && p.subPos.length > 0 ? p.subPos.join(', ') : "なし"}</p>
            <div class="modal-btns">
                <button class="btn-edit-mode admin-only" onclick="showEditForm('${id}')">編集・ステータス変更</button>
            </div>
        </div>
    `;
    document.getElementById('modal-overlay').style.display = 'flex';
}

function showEditForm(id) {
    const p = players.find(player => String(player.id) === String(id));
    document.getElementById('modal-title').innerText = `${p.name} の編集`;
    const subCheckboxesHtml = positionOptions.map(pos => `
        <label class="checkbox-item"><input type="checkbox" name="edit-sub-pos" value="${pos}" ${p.subPos && p.subPos.includes(pos) ? "checked" : ""}> ${pos}</label>
    `).join('');
    const suggestedNum = getSuggestedAssistantNumber();

    const nameParts = p.name.split(" ");
    const lastName = nameParts[0] || "";
    const firstName = nameParts.slice(1).join(" ") || "";

    const furiParts = (p.furigana || "").split(/[ 　]+/);
    const furiLast = furiParts[0] || "";
    const furiFirst = furiParts.slice(1).join(" ") || "";

    document.getElementById('modal-body').innerHTML = `
        <div class="edit-form">
            <label>ステータス:</label>
            <select id="edit-status">
                <option value="現役" ${(p.status || '現役') === '現役' ? 'selected' : ''}>現役</option>
                <option value="活動休止中" ${p.status === '活動休止中' ? 'selected' : ''}>活動休止中</option>
                <option value="OB・OG" ${p.status === 'OB・OG' ? 'selected' : ''}>OB・OG</option>
            </select>

            <label>氏名:</label> 
            <div class="flex-gap-8">
                <input type="text" id="edit-name-last" class="flex-1" value="${lastName}" placeholder="苗字">
                <input type="text" id="edit-name-first" class="flex-1" value="${firstName}" placeholder="名前">
            </div>

            <label>フリガナ:</label> 
            <div class="flex-gap-8">
                <input type="text" id="edit-furigana-last" class="flex-1" value="${furiLast}" placeholder="フリガナ(苗字)" onblur="this.value = convertToKatakana(this.value)">
                <input type="text" id="edit-furigana-first" class="flex-1" value="${furiFirst}" placeholder="フリガナ(名前)" onblur="this.value = convertToKatakana(this.value)">
            </div>

            <label>背番号:</label> 
            <input type="text" inputmode="numeric" id="edit-number" value="${p.number === '無' ? '' : p.number}" placeholder="助っ人候補: ${suggestedNum}" oninput="formatNumberInput(this)">
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
            
            <div class="modal-btns mt-10">
                <button class="btn-save admin-only" onclick="updatePlayer()">保存する</button>
            </div>

            <hr class="modal-hr" style="margin: 25px 0 15px 0;">
            <div style="text-align: center;">
                <p class="help-text" style="color: var(--danger-color); font-weight: bold; margin-bottom: 5px;">⚠️ 削除の前にご確認ください</p>
                <p class="help-text-small mb-10">名前や記録を一切残したくない場合のみ使用してください。通常はステータス「OB・OG」への変更を推奨しています。</p>
                <button class="btn-delete w-100 admin-only" style="padding: 10px;" onclick="deletePlayer('${id}')">この選手を完全に削除する</button>
            </div>
        </div>
    `;
}

function updatePlayer() {
    if (!checkAdmin()) return;
    const p = players.find(player => String(player.id) === String(currentEditingPlayerId));
    if (!p) return;

    const newStatus = document.getElementById('edit-status').value;
    let numInput = document.getElementById('edit-number').value;
    numInput = numInput.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).replace(/[^0-9]/g, '');
    const numberToSave = numInput === "" ? "無" : String(numInput);

    if (newStatus === "現役" && numberToSave !== "無") {
        const isDuplicate = players.some(player => {
            if (String(player.id) === String(currentEditingPlayerId)) return false; 
            return (player.status || "現役") === "現役" && String(player.number) === numberToSave;
        });
        if (isDuplicate) return alert(`エラー：背番号「${numberToSave}」は既に他の現役選手が使用中です。`);
    }

    if (String(p.number) !== numberToSave && p.number !== "無") {
        if (!p.pastNumbers) p.pastNumbers = [];
        if (!p.pastNumbers.includes(String(p.number))) p.pastNumbers.push(String(p.number));
    }

    const lastName = document.getElementById('edit-name-last').value.trim();
    const firstName = document.getElementById('edit-name-first').value.trim();
    if(!lastName || !firstName) return alert("苗字と名前を両方入力してください");
    p.name = lastName + " " + firstName;

    const furiLast = document.getElementById('edit-furigana-last').value.trim();
    const furiFirst = document.getElementById('edit-furigana-first').value.trim();
    let furigana = "";
    if (furiLast || furiFirst) {
        furigana = (furiLast + " " + furiFirst).trim();
        if (!/^[ァ-ヶー・\s　]+$/.test(furigana)) {
            return alert("エラー：フリガナは「全角カタカナ」のみ入力してください。");
        }
    }
    p.furigana = furigana;

    p.status = newStatus;
    p.number = numberToSave;
    p.side = document.getElementById('edit-side').value;
    p.mainPos = document.getElementById('edit-main-pos').value;
    p.subPos = Array.from(document.querySelectorAll('input[name="edit-sub-pos"]:checked')).map(cb => cb.value);

    saveAndRefreshPlayers();
    closeModal();
}

function deletePlayer(id) {
    if (!checkAdmin()) return;
    
    if(!confirm("削除して良いですか？了解は取れていますか？\n（※通常はステータス「活動休止中」および「OB・OG」への変更を推奨しています）")) {
        return;
    }

    players = players.filter(p => String(p.id) !== String(id));
    saveAndRefreshPlayers();
    
    alert("削除しました。可能な限り、本人にお伝えください。");
    closeModal();
}

function renderPlayerList() {
    const container = document.getElementById('player-list-container');
    if (!container) return;

    let html = "";
    const statuses = ["現役", "活動休止中", "OB・OG"];

    statuses.forEach((status, index) => {
        const group = players.filter(p => (p.status || "現役") === status);
        
        if (group.length > 0) {
            const isOpen = status === "現役" ? "open" : "";
            
            const sortedGroup = group.sort((a, b) => {
                const numA = (a.number === "無" || a.number === "") ? Infinity : parseFloat(a.number);
                const numB = (b.number === "無" || b.number === "") ? Infinity : parseFloat(b.number);
                return numA - numB;
            });
            
            html += `
                <div id="player-accordion-${index}" class="accordion-card ${isOpen} mb-10">
                    <div class="game-accordion-header" onclick="togglePlayerAccordion(${index})">
                        <div class="player-status-header">
                            ${status} <span class="player-status-count">(${group.length}名)</span>
                        </div>
                    </div>
                    
                    <div class="game-accordion-body player-accordion-body">
                        <div class="table-container table-container-flat">
                            <table>
                                <thead>
                                    <tr>
                                        <th>背番号</th>
                                        <th>氏名</th>
                                        <th>投打</th>
                                        <th>守備</th>
                                    </tr>
                                </thead>
                                <tbody>
            `;
            
            sortedGroup.forEach(p => {
                html += `<tr><td>${p.number}</td><td><span class="name-link" onclick="showPlayerDetail('${p.id}')">${p.name}</span></td><td>${p.side}</td><td>${p.mainPos}</td></tr>`;
            });
            
            html += `
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
        }
    });
    
    container.innerHTML = html;

    const datalist = document.getElementById('team-members-list');
    if (datalist) {
        const sortedAllPlayers = [...players].sort((a, b) => {
            const numA = (a.number === "無" || a.number === "") ? Infinity : parseFloat(a.number);
            const numB = (b.number === "無" || b.number === "") ? Infinity : parseFloat(b.number);
            return numA - numB;
        });
        datalist.innerHTML = sortedAllPlayers.map(p => `<option value="${p.name}"></option>`).join('');
    }
}

function togglePlayerAccordion(index) {
    const card = document.getElementById(`player-accordion-${index}`);
    if (card) {
        card.classList.toggle('open');
    }
}

/**
 * 🌟 試合管理・スコア入力機能
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
    
    const activePlayerIds = players.filter(p => (p.status || "現役") === "現役").map(p => String(p.id));

    const g = isEdit ? games.find(game => game.id === gameId) : {
        date: new Date().toISOString().split('T')[0],
        opponent: "", location: "", weather: "晴れ", side: "先攻", 
        participants: activePlayerIds
    };
    tempParticipants = g.participants ? [...g.participants] : activePlayerIds;

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
            <label class="modal-section-label">当日の参加者:</label>
            <p class="help-text mb-10">※デフォルトで現役選手が登録されています。欠席者を「✖」で外してください。</p>
            <div class="flex-gap-8">
                <select id="g-participant-select" class="flex-1"></select>
                <button type="button" class="btn-small-action btn-small-gray admin-only" onclick="addParticipant()">追加</button>
            </div>
            <div id="g-participants-list" class="participant-list-container"></div>
            <div class="modal-btns mt-20">
                <button class="btn-save admin-only" onclick="processGame(${gameId})">${isEdit ? '変更を保存する' : '試合を作成する'}</button>
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
            const pStatus = (p.status === "現役" || !p.status) ? "" : ` (${p.status})`;
            optionsHtml += `<option value="${p.id}">[${p.number === "無" ? "無" : '#' + p.number}] ${p.name}${pStatus}</option>`;
        }
    });
    selectEl.innerHTML = optionsHtml;

    if (tempParticipants.length === 0) {
        listEl.innerHTML = '<span class="empty-participants">参加者がいません</span>';
    } else {
        listEl.innerHTML = tempParticipants.map(pid => {
            const p = players.find(pl => String(pl.id) === String(pid));
            if (!p) return '';
            return `<span class="participant-badge">${p.name} <span class="participant-remove admin-only" onclick="removeParticipant('${pid}')">&times;</span></span>`;
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
    if (!checkAdmin()) return;
    const date = document.getElementById('g-date').value;
    const opponent = document.getElementById('g-opponent').value;
    if(!date || !opponent) return alert("日付と相手名は必須です");

    const gameData = {
        id: gameId || Date.now(),
        date: date, opponent: opponent,
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

function changeGameYear(year) {
    currentGameYear = year;
    renderGameList();
}

function renderGameList() {
    const container = document.getElementById('game-list-container');
    if(!container) return;
    
    const years = [...new Set(games.map(g => g.date.substring(0, 4)))].sort((a, b) => b - a);

    const optionsHtml = `<option value="all" ${currentGameYear==='all'?'selected':''}>通算</option>` +
        years.map(y => `<option value="${y}" ${currentGameYear===String(y)?'selected':''}>${y}年</option>`).join('');

    const gSelect = document.getElementById('game-year-select');
    if(gSelect) gSelect.innerHTML = optionsHtml;

    const targetGames = games.filter(g => {
        if (currentGameYear === "all") return true;
        return g.date.substring(0, 4) === currentGameYear;
    });

    const emptyMsg = '<p class="empty-message">対象の試合がありません</p>';
    if(targetGames.length === 0) {
        container.innerHTML = emptyMsg;
        return;
    }

    const sortedGames = [...targetGames].sort((a, b) => new Date(b.date) - new Date(a.date));

    container.innerHTML = sortedGames.map(g => {
        const resultText = g.isFinished ? (g.score.us > g.score.them ? ' (勝)' : g.score.us < g.score.them ? ' (敗)' : ' (分)') : ' (未完了)';
        const weatherIcon = g.weather === '晴れ' ? '☀️' : g.weather === '曇り' ? '☁️' : g.weather === '雨' ? '☔' : '❓';
        const pCount = g.participants ? g.participants.length : 0; 
        const deleteBtnHtml = isGameDeleteMode ? `<button class="btn-delete-game mt-15 w-100 admin-only" onclick="deleteGame(${g.id})">この試合を削除</button>` : '';

        return `
            <div id="game-card-${g.id}" class="game-card accordion-card">
                <div class="game-accordion-header" onclick="toggleGameAccordion(${g.id})">
                    <div class="game-date-text">📅 ${g.date} (${g.side})</div>
                    <div class="game-opponent-text">vs ${g.opponent}</div>
                </div>
                
                <div class="game-accordion-body">
                    <div class="game-detail-text">☁️ 天気: ${g.weather}</div>
                    <div class="game-detail-text">📍 場所: ${g.location}</div>
                    <div class="game-detail-text">👥 参加: ${pCount}名</div>
                    <div class="game-detail-text score-text mt-10">スコア: ${g.score.us} - ${g.score.them}${resultText}</div>
                    
                    <div class="flex-gap-8 mt-15">
                        <button class="btn-small-action btn-small-blue flex-1 p-10" onclick="showLineupModal(${g.id})">スタメン・打順</button>
                        <button class="btn-small-action btn-small-gray flex-1 p-10 admin-only" onclick="showAddGameModal(${g.id})">試合情報の編集</button>
                    </div>

                    <div class="score-action-container mt-10">
                        <button class="btn-small-action btn-small-green w-100 p-10" onclick="showScoreInputModal(${g.id})">イニングスコアボード</button>
                        <div class="flex-gap-8">
                            <button class="btn-small-action btn-small-orange flex-1 p-10" onclick="showAtBatMatrixModal(${g.id})">打席成績</button>
                            <button class="btn-small-action btn-small-purple flex-1 p-10" onclick="showPitcherModal(${g.id})">投手成績</button>
                        </div>
                    </div>
                    
                    ${deleteBtnHtml}
                </div>
            </div>`;
    }).join('');
}

function toggleGameAccordion(id) {
    const card = document.getElementById(`game-card-${id}`);
    if (card) {
        card.classList.toggle('open');
    }
}

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
            <button class="btn-small-action btn-small-green mt-10 admin-only" onclick="addLineupRow()">＋ 打者を追加</button>
            <div class="modal-btns">
                <button class="btn-save admin-only" onclick="saveLineup()">スタメンを保存</button>
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
                    const pStatus = (p.status === "現役" || !p.status) ? "" : ` (${p.status})`;
                    return `<option value="${p.id}" ${String(p.id) === String(item.playerId) ? 'selected' : ''}>[${p.number === "無" ? "無" : '#' + p.number}] ${p.name}${pStatus}</option>`;
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
            <button class="btn-remove-row admin-only" onclick="removeLineupRow(${index})">✖</button>
        `;
        wrapper.appendChild(row);
    });
}

function updateTempLineup(index, key, value) { tempLineup[index][key] = value; if (key === 'playerId' || key === 'position') renderLineupRows(); }
function addLineupRow() { tempLineup.push({ playerId: "", position: "", results: [] }); renderLineupRows(); }
function removeLineupRow(index) { tempLineup.splice(index, 1); renderLineupRows(); }

function saveLineup() {
    if (!checkAdmin()) return;
    const filteredLineup = tempLineup.filter(item => item.playerId !== "");
    filteredLineup.forEach(item => { if (!item.results) item.results = []; });
    currentGameForScore.lineup = filteredLineup;
    saveAndRefreshGames();
    closeModal();
}

function showPitcherModal(gameId) {
    currentGameForScore = games.find(g => g.id === gameId);
    if (!currentGameForScore.pitchers) currentGameForScore.pitchers = [];
    tempPitchers = JSON.parse(JSON.stringify(currentGameForScore.pitchers));
    if (tempPitchers.length === 0) tempPitchers.push({ playerId: "", innings: "", outs: "0", er: "", so: "", bb: "" });
    document.getElementById('modal-title').innerText = `投手成績 (vs ${currentGameForScore.opponent})`;
    document.getElementById('modal-body').innerHTML = `
        <div class="edit-form">
            ${getScoreBannerHtml()}
            <p class="help-text mb-10">登板した投手の成績を入力してください。</p>
            <div id="pitcher-wrapper"></div>
            <button class="btn-small-action btn-small-green mt-10 admin-only" onclick="addPitcherRow()">＋ 投手を登録</button>
            <div class="modal-btns"><button class="btn-save admin-only" onclick="savePitchers()">投手成績を保存</button></div>
        </div>
    `;
    renderPitcherRows();
    document.getElementById('modal-overlay').style.display = 'flex';
}

function renderPitcherRows() {
    const wrapper = document.getElementById('pitcher-wrapper');
    wrapper.innerHTML = "";
    
    // 🌟 閲覧権限の確認
    const isAdmin = currentTeamAdmins.includes(currentUser.uid);

    tempPitchers.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = "pitcher-row mb-10";
        
        // 🌟 アウト数から「◯回 ◯/3」を自動計算する
        let currentTotalOuts = (parseInt(item.innings) || 0) * 3 + (parseInt(item.outs) || 0);
        let innDisp = Math.floor(currentTotalOuts / 3);
        let outDisp = currentTotalOuts % 3;
        let displayOuts = `${innDisp}回 ${outDisp}/3`;
        if(currentTotalOuts === 0) displayOuts = "0/3";
        
        // カウンターUIの生成関数
        const createCounter = (label, key, valText, isWide = false) => {
            const wideClass = isWide ? "pitcher-val-wide" : "";
            if (!isAdmin) {
                return `
                <div class="pitcher-stat-item">
                    <span class="pitcher-stat-label">${label}</span>
                    <span class="score-value ${wideClass}">${valText}</span>
                </div>`;
            }
            return `
            <div class="pitcher-stat-item">
                <span class="pitcher-stat-label">${label}</span>
                <div class="score-counter">
                    <span class="score-value ${wideClass}">${valText}</span>
                    <div class="spinner-btns">
                        <button class="btn-spinner" onclick="adjustPitcherStat(${index}, '${key}', 1)">▲</button>
                        <button class="btn-spinner" onclick="adjustPitcherStat(${index}, '${key}', -1)">▼</button>
                    </div>
                </div>
            </div>`;
        };

        row.innerHTML = `
            <div class="flex-gap-8 mb-8">
                <select class="flex-select w-100" onchange="updatePitcher(${index}, 'playerId', this.value)" ${isAdmin ? "" : "disabled"}>
                    <option value="">-- 投手を選択 --</option>
                    ${players.map(p => {
                        const isSelected = tempPitchers.some((t, i) => i !== index && String(t.playerId) === String(p.id));
                        if (isSelected) return ''; 
                        const pStatus = (p.status === "現役" || !p.status) ? "" : ` (${p.status})`;
                        return `<option value="${p.id}" ${String(p.id) === String(item.playerId) ? 'selected' : ''}>[${p.number === "無" ? "無" : '#' + p.number}] ${p.name}${pStatus}</option>`;
                    }).join('')}
                </select>
                ${isAdmin ? `<button class="btn-remove-row admin-only" onclick="removePitcherRow(${index})">✖</button>` : ""}
            </div>
            <div class="pitcher-grid-counter">
                ${createCounter("投球回(ｱｳﾄ)", "outs", displayOuts, true)}
                ${createCounter("自責点", "er", item.er || "0")}
                ${createCounter("奪三振", "so", item.so || "0")}
                ${createCounter("四死球", "bb", item.bb || "0")}
            </div>
        `;
        wrapper.appendChild(row);
    });
}

// 🌟 新規追加：＋/－ボタンで投手成績を増減させる関数
function adjustPitcherStat(index, key, delta) {
    if (!checkAdmin()) return;
    
    // 投球回（アウト）の場合は、自動で「イニング」と「アウト」に振り分ける
    if (key === 'outs') {
        let currentTotalOuts = (parseInt(tempPitchers[index].innings) || 0) * 3 + (parseInt(tempPitchers[index].outs) || 0);
        currentTotalOuts += delta;
        if (currentTotalOuts < 0) currentTotalOuts = 0;
        
        tempPitchers[index].innings = Math.floor(currentTotalOuts / 3).toString();
        tempPitchers[index].outs = (currentTotalOuts % 3).toString();
    } 
    // それ以外の項目（自責点・奪三振など）
    else {
        let currentVal = parseInt(tempPitchers[index][key]) || 0;
        currentVal += delta;
        if (currentVal < 0) currentVal = 0;
        tempPitchers[index][key] = currentVal.toString();
    }
    renderPitcherRows();
}

function updatePitcher(index, key, value) { tempPitchers[index][key] = value; if (key === 'playerId') renderPitcherRows(); }
function addPitcherRow() { tempPitchers.push({ playerId: "", innings: "", outs: "0", er: "", so: "", bb: "" }); renderPitcherRows(); }
function removePitcherRow(index) { tempPitchers.splice(index, 1); renderPitcherRows(); }
function savePitchers() {
    if (!checkAdmin()) return;
    const filtered = tempPitchers.filter(item => item.playerId !== "");
    currentGameForScore.pitchers = filtered;
    saveAndRefreshGames();
    closeModal();
}

// 🌟 修正：先攻が左側、後攻が右側になるように連動させたバナー生成関数
function getScoreBannerHtml() {
    const g = currentGameForScore;
    if (!g) return '';
    if (!g.innings) g.innings = Array(9).fill().map(() => ({ us: "", them: "" }));
    
    let totalUs = g.innings.reduce((sum, inn) => sum + (parseInt(inn.us) || 0), 0);
    let totalThem = g.innings.reduce((sum, inn) => sum + (parseInt(inn.them) || 0), 0);
    
    // 🌟 先攻・後攻の判定
    const isUsBattingFirst = g.side === "先攻";

    // 🌟 先攻を必ず左側、後攻を必ず右側に配置する
    const leftName = isUsBattingFirst ? "自チーム(先攻)" : "相手(先攻)";
    const rightName = isUsBattingFirst ? "相手(後攻)" : "自チーム(後攻)";
    const leftScore = isUsBattingFirst ? totalUs : totalThem;
    const rightScore = isUsBattingFirst ? totalThem : totalUs;
    
    return `
        <div class="current-score-banner">
            <div class="current-score-text">
                ${leftName} <span class="score-highlight">${leftScore} - ${rightScore}</span> ${rightName}
            </div>
            <button class="btn-jump-score" onclick="showScoreInputModal(${g.id})">
                ⚾️ スコアボードを開いて点を入れる
            </button>
        </div>
    `;
}

function showAtBatMatrixModal(gameId) {
    currentGameForScore = games.find(g => g.id === gameId);
    const g = currentGameForScore;
    if (!g.lineup || g.lineup.length === 0) return alert("先に「試合情報」タブからスタメン・打順を設定してください。");
    g.lineup.forEach(item => { if (!item.results) item.results = []; });
    let maxCols = 5;
    g.lineup.forEach(item => { if (item.results.length >= maxCols) maxCols = item.results.length + 1; });
    currentAtBatColumns = maxCols;
    renderAtBatMatrix();
}

function renderAtBatMatrix() {
    const g = currentGameForScore;
    let headerHtml = `<th>順</th><th class="th-left">選手</th>`;
    for(let i=0; i<currentAtBatColumns; i++) headerHtml += `<th>第${i+1}打席</th>`;

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
            colsHtml += `<td class="atbat-cell ${isFilled}" onclick="openAtBatInput(${lineIdx}, ${atBatIdx})">${text}${rbiText}${stealText}</td>`;
        }
        return `<tr><td class="td-center-bold">${lineIdx+1}</td><td class="team-name">${pName}<br><span class="player-pos-sub">${item.position}</span></td>${colsHtml}</tr>`;
    }).join('');

    document.getElementById('modal-title').innerText = "打席成績の入力";
    document.getElementById('modal-body').innerHTML = `
        <div class="edit-form">
            <p class="modal-vs-title">vs ${g.opponent}</p>
            ${getScoreBannerHtml()}
            <p class="help-text mb-10">入力したい打席の枠をタップしてください。</p>
            <div class="score-table-container">
                <table class="score-table atbat-table">
                    <thead><tr>${headerHtml}</tr></thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>
            <div class="flex-gap-8 mt-10 admin-only">
                <button class="btn-small-action btn-small-gray flex-1" onclick="addAtBatColumn()">＋ 列を追加</button>
                <button class="btn-small-action bg-danger flex-1" onclick="removeAtBatColumn()">ー 列を削除</button>
            </div>
            <div class="modal-btns mt-15"><button class="btn-save bg-gray" onclick="closeModal();">閉じる</button></div>
        </div>
    `;
    document.getElementById('modal-overlay').style.display = 'flex';
}

function removeAtBatColumn() {
    if (currentAtBatColumns > 1) { currentAtBatColumns--; renderAtBatMatrix(); } 
    else alert("これ以上打席列を削除できません。");
}
function addAtBatColumn() { currentAtBatColumns++; renderAtBatMatrix(); }

function openAtBatInput(lineIdx, atBatIdx) {
    if (!currentTeamAdmins.includes(currentUser.uid)) return alert("【閲覧専用モード】\nこの操作は管理者のみ可能です。");
    const g = currentGameForScore;
    const item = g.lineup[lineIdx];
    const player = players.find(p => String(p.id) === String(item.playerId));
    const pName = player ? player.name : "不明";
    const currentRes = item.results[atBatIdx] || { result: "", rbi: 0, steal: 0 };
    const resultOptions = ['', '単打', '二塁打', '三塁打', '本塁打', '四死球', '三振', '内野ゴロ', '内野フライ', '外野フライ', 'エラー出塁', '犠打・犠飛'];
    
    document.getElementById('modal-title').innerText = `第${atBatIdx+1}打席: ${pName}`;
    document.getElementById('modal-body').innerHTML = `
        <div class="edit-form">
            ${getScoreBannerHtml()}
            <label>結果:</label>
            <select id="ab-result" class="large-select">
                ${resultOptions.map(opt => `<option value="${opt}" ${currentRes.result === opt ? 'selected' : ''}>${opt === '' ? '-- 選択してください --' : opt}</option>`).join('')}
            </select>
            <div class="flex-gap-8 mt-10">
                <div class="flex-1"><label>打点:</label>
                    <select id="ab-rbi" class="large-select w-100">
                        ${[0,1,2,3,4].map(n => `<option value="${n}" ${Number(currentRes.rbi) === n ? 'selected' : ''}>${n}</option>`).join('')}
                    </select>
                </div>
                <div class="flex-1"><label>盗塁:</label>
                    <select id="ab-steal" class="large-select w-100">
                        ${[0,1,2,3,4].map(n => `<option value="${n}" ${Number(currentRes.steal) === n ? 'selected' : ''}>${n}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="modal-btns mt-20">
                <div class="atbat-nav-btns">
                    <button class="btn-save-blue btn-save bg-blue" onclick="saveAndPrevAtBat(${lineIdx}, ${atBatIdx})">⬅ 前の打者</button>
                    <button class="btn-save-blue btn-save bg-blue" onclick="saveAndNextAtBat(${lineIdx}, ${atBatIdx})">次の打者 ➡</button>
                </div>
                <button class="btn-save-green btn-save bg-green" onclick="saveAtBatInput(${lineIdx}, ${atBatIdx})">決定して表に戻る</button>
                <button class="btn-delete bg-danger" onclick="clearAtBatInput(${lineIdx}, ${atBatIdx})">この打席を空欄にする</button>
                <button class="btn-edit-mode bg-gray" onclick="renderAtBatMatrix()">キャンセル</button>
            </div>
        </div>
    `;
}

// 🌟 新規追加：保存して「前の打者」の画面に移動する関数
function saveAndPrevAtBat(lineIdx, atBatIdx) {
    if (!checkAdmin()) return;
    
    // 1. まず現在の打席の内容を保存する
    currentGameForScore.lineup[lineIdx].results[atBatIdx] = { 
        result: document.getElementById('ab-result').value, 
        rbi: Number(document.getElementById('ab-rbi').value), 
        steal: Number(document.getElementById('ab-steal').value) 
    };
    saveAndRefreshGames();
    
    // 2. 前の打者のインデックスを計算する
    let prevLine = lineIdx - 1;
    let prevAtBat = atBatIdx;
    
    // もし1番上のバッターより上に行こうとしたら、1つ前の打席の1番下のバッターに移動
    if (prevLine < 0) { 
        prevLine = currentGameForScore.lineup.length - 1; 
        prevAtBat--; 
    }
    
    // 3番バッターの第1打席などからさらに前へ戻ろうとした場合のブロック
    if (prevAtBat < 0) {
        alert("これより前の打席はありません。");
        renderAtBatMatrix(); 
        return;
    }
    
    // 3. 表を再描画して、前の打者の入力モーダルを開く
    renderAtBatMatrix(); 
    openAtBatInput(prevLine, prevAtBat);
}

function saveAndNextAtBat(lineIdx, atBatIdx) {
    if (!checkAdmin()) return;
    currentGameForScore.lineup[lineIdx].results[atBatIdx] = { 
        result: document.getElementById('ab-result').value, 
        rbi: Number(document.getElementById('ab-rbi').value), 
        steal: Number(document.getElementById('ab-steal').value) 
    };
    saveAndRefreshGames();
    let nextLine = lineIdx + 1;
    let nextAtBat = atBatIdx;
    if (nextLine >= currentGameForScore.lineup.length) { nextLine = 0; nextAtBat++; }
    if (nextAtBat >= currentAtBatColumns) currentAtBatColumns++;
    renderAtBatMatrix(); 
    openAtBatInput(nextLine, nextAtBat);
}

function saveAtBatInput(lineIdx, atBatIdx) {
    if (!checkAdmin()) return;
    currentGameForScore.lineup[lineIdx].results[atBatIdx] = { 
        result: document.getElementById('ab-result').value, 
        rbi: Number(document.getElementById('ab-rbi').value), 
        steal: Number(document.getElementById('ab-steal').value) 
    };
    saveAndRefreshGames();
    renderAtBatMatrix(); 
}

function clearAtBatInput(lineIdx, atBatIdx) {
    if (!checkAdmin()) return;
    currentGameForScore.lineup[lineIdx].results[atBatIdx] = { result: "", rbi: 0, steal: 0 };
    saveAndRefreshGames();
    renderAtBatMatrix();
}

function showScoreInputModal(gameId) {
    currentGameForScore = games.find(game => game.id === gameId);
    if (!currentGameForScore.innings) currentGameForScore.innings = Array(9).fill().map(() => ({ us: "", them: "" }));
    const isAdmin = currentTeamAdmins.includes(currentUser.uid);
    const disabledAttr = isAdmin ? "" : "disabled";
    const labelClass = isAdmin ? "" : "disabled-label";

    document.getElementById('modal-title').innerText = "イニングスコア入力";
    document.getElementById('modal-body').innerHTML = `
        <div class="edit-form">
            <p class="modal-vs-title-lg">vs ${currentGameForScore.opponent}</p>
            <div id="score-board-wrapper"></div>
            <div class="flex-gap-8 mt-10 admin-only">
                <button class="btn-small-action btn-small-gray flex-1" onclick="addInning()">＋ イニング追加</button>
                <button class="btn-small-action bg-danger flex-1" onclick="removeInning()">ー イニング削除</button>
            </div>
            <label class="checkbox-label-row ${labelClass}">
                <input type="checkbox" id="s-finished" class="chk-finished" ${currentGameForScore.isFinished ? 'checked' : ''} ${disabledAttr}>
                この試合を終了とする（集計に反映）
            </label>
            <div class="modal-btns mt-20"><button class="btn-save admin-only" onclick="saveScoreBoard()">スコアを保存する</button></div>
        </div>
    `;
    renderScoreBoardTable();
    document.getElementById('modal-overlay').style.display = 'flex';
}

function removeInning() {
    if (currentGameForScore.innings.length > 1) { currentGameForScore.innings.pop(); renderScoreBoardTable(); } 
    else alert("これ以上イニングを削除できません。");
}

function renderScoreBoardTable() {
    const g = currentGameForScore;
    const headerHtml = g.innings.map((_, i) => `<th>${i + 1}</th>`).join('');

    // 🌟 閲覧権限の確認
    const isAdmin = currentTeamAdmins.includes(currentUser.uid);

    // 🌟 カウンターを生成する関数（縦型▲▼ボタン版）
    const createCounterHtml = (index, team, value) => {
        const valStr = (value === "" || value === undefined) ? "0" : value;
        if (!isAdmin) return `<span class="score-value">${valStr}</span>`; // 閲覧モード時は数字のみ

        return `
            <div class="score-counter">
                <span class="score-value">${valStr}</span>
                <div class="spinner-btns">
                    <button class="btn-spinner" onclick="adjustInningScore(${index}, '${team}', 1)">▲</button>
                    <button class="btn-spinner" onclick="adjustInningScore(${index}, '${team}', -1)">▼</button>
                </div>
            </div>
        `;
    };

    const usCells = g.innings.map((inning, i) => `<td>${createCounterHtml(i, 'us', inning.us)}</td>`).join('');
    const themCells = g.innings.map((inning, i) => `<td>${createCounterHtml(i, 'them', inning.them)}</td>`).join('');

    let totalUs = g.innings.reduce((sum, inn) => sum + (parseInt(inn.us) || 0), 0);
    let totalThem = g.innings.reduce((sum, inn) => sum + (parseInt(inn.them) || 0), 0);

    // 🌟 先攻・後攻の判定と行の入れ替え
    const isUsBattingFirst = g.side === "先攻";
    const themSide = isUsBattingFirst ? "後攻" : "先攻";

    // 自チームと相手チームの行HTMLを作成
    const usRow = `<tr><td class="team-name">自チーム<br><span class="player-pos-sub">(${g.side})</span></td>${usCells}<td id="score-total-us" class="score-total">${totalUs}</td></tr>`;
    const themRow = `<tr><td class="team-name">相手<br><span class="player-pos-sub">(${themSide})</span></td>${themCells}<td id="score-total-them" class="score-total">${totalThem}</td></tr>`;

    // 🌟 必ず「先攻」が上（表）、「後攻」が下（裏）になるように並べ替える
    const tbodyHtml = isUsBattingFirst ? (usRow + themRow) : (themRow + usRow);

    document.getElementById('score-board-wrapper').innerHTML = `
        <div class="score-table-container">
            <table class="score-table">
                <thead><tr><th class="team-name">チーム</th>${headerHtml}<th>計</th></tr></thead>
                <tbody>
                    ${tbodyHtml}
                </tbody>
            </table>
        </div>
    `;
}

// 🌟 新規追加：＋/－ボタンでスコアを増減させる関数
function adjustInningScore(index, team, delta) {
    if (!checkAdmin()) return;
    const currentVal = parseInt(currentGameForScore.innings[index][team]) || 0;
    let newVal = currentVal + delta;
    
    // スコアがマイナスにならないようにブロック
    if (newVal < 0) newVal = 0; 
    
    currentGameForScore.innings[index][team] = String(newVal);
    renderScoreBoardTable(); // 画面を再描画して合計点も更新
}

function addInning() { currentGameForScore.innings.push({ us: "", them: "" }); renderScoreBoardTable(); }

function saveScoreBoard() {
    if (!checkAdmin()) return;
    const g = currentGameForScore;
    g.score.us = g.innings.reduce((sum, inn) => sum + (parseInt(inn.us) || 0), 0);
    g.score.them = g.innings.reduce((sum, inn) => sum + (parseInt(inn.them) || 0), 0);
    g.isFinished = document.getElementById('s-finished').checked;
    saveAndRefreshGames();
    updateTeamRecord();
    closeModal();
}

function deleteGame(id) {
    if (!checkAdmin()) return;
    if(confirm("試合情報を削除しますか？")) {
        games = games.filter(g => g.id !== id);
        saveAndRefreshGames();
        updateTeamRecord();
    }
}

async function saveAndRefreshPlayers() {
    renderPlayerList(); 
    if (currentTeamId) {
        try { await db.collection("teams").doc(currentTeamId).update({ players: players }); } 
        catch(e) { console.error("選手保存エラー", e); }
    }
}

async function saveAndRefreshGames() {
    renderGameList();
    renderStatsPage(); 
    if (currentTeamId) {
        try { await db.collection("teams").doc(currentTeamId).update({ games: games }); } 
        catch(e) { console.error("試合保存エラー", e); }
    }
}

function showHelpModal(pageId) {
    const helpData = {
        login: {
            title: "ログイン・新規登録の使い方",
            content: `
                <div class="help-content-modal">
                    <p><strong>【はじめての方（新規登録）】</strong></p>
                    <p>1. お使いの「メールアドレス」と「パスワード」を入力します。</p>
                    <p>2. 「登録して始める」ボタンを押します。</p>
                    <hr class="modal-hr">
                    <p><strong>【すでに登録済みの方（ログイン）】</strong></p>
                    <p>登録した「メールアドレス」と「パスワード」を入力し、ログインしてください。</p>
                </div>`
        },
        team: {
            title: "チーム情報の使い方",
            content: `
                <div class="help-content-modal">
                    <p>・チームの基本情報と、所属する<strong>選手の名簿</strong>を管理します。</p>
                    <p>・「選手登録」からメンバーを追加してください（現役選手の背番号重複はできません）。</p>
                    <p>・選手ごとのステータス（現役・活動休止中・OB/OG）も設定可能です。</p>
                </div>`
        },
        game: {
            title: "試合管理・スコア入力の使い方",
            content: `
                <div class="help-content-modal">
                    <p>試合の予定作成から、<strong>当日のスタメン登録、スコア入力まで</strong>をすべてこの画面で行います。</p>
                    
                    <p style="color: var(--grass-green); font-weight: bold; margin-top: 15px;">【1. 試合の準備】</p>
                    <p>・「新規試合登録」から対戦相手や参加者を登録します。</p>
                    <p>・試合のカードをタップして開き、「スタメン・打順」ボタンからオーダーを組みます。</p>
                    
                    <p style="color: var(--score-blue); font-weight: bold; margin-top: 15px;">【2. スコアの入力】</p>
                    <p>・<strong>打席成績：</strong>表のマス目をタップして結果を入力します。</p>
                    <p>・<strong>投手成績：</strong>登板した投手の投球回や自責点を入力します。</p>
                    <p>・試合が終わったら「イニングスコアボード」を開き、<strong>『この試合を終了とする』にチェックを入れて保存</strong>してください。これで通算成績にデータが反映されます。</p>
                </div>`
        },
        stats: {
            title: "成績の使い方",
            content: `
                <div class="help-content-modal">
                    <p>・「終了済」になった試合のデータから、<strong>個人の打撃成績と投手成績を自動で計算</strong>して表示します。</p>
                    <p>・「表示年」のプルダウンで年ごとの成績に絞り込めます。</p>
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
 * 🌟 成績・表示の更新
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
        selectEl.className = 'record-year-select';
        selectEl.onchange = function() {
            currentRecordYear = this.value;
            updateTeamRecord();
        };
        el.parentNode.insertBefore(selectEl, el);
    }
    
    selectEl.innerHTML = `<option value="all" ${currentRecordYear==='all'?'selected':''}>通算成績</option>` +
        years.map(y => `<option value="${y}" ${currentRecordYear===String(y)?'selected':''}>${y}年</option>`).join('');

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

    let yearOptionsHtml = `<option value="all" ${currentStatsYear === 'all' ? 'selected' : ''}>通算</option>`;
    
    years.forEach(y => { yearOptionsHtml += `<option value="${y}" ${currentStatsYear === String(y) ? 'selected' : ''}>${y}年</option>`; });

    const filterHtml = `
        <div class="filter-container">
            <label class="filter-label">表示年:</label>
            <select id="stats-year-select" class="filter-select" onchange="changeStatsYear(this.value)">${yearOptionsHtml}</select>
        </div>
    `;

    const targetGames = finishedGames.filter(g => currentStatsYear === "all" || g.date.substring(0, 4) === currentStatsYear);
    const playerStats = {};
    const pitcherStats = {};
    players.forEach(p => {
        playerStats[p.id] = { name: p.name, number: p.number === "無" ? "-" : p.number, games: 0, pa: 0, ab: 0, hits: 0, hr: 0, rbi: 0, sb: 0, bb: 0, so: 0 };
        pitcherStats[p.id] = { name: p.name, number: p.number === "無" ? "-" : p.number, games: 0, outs: 0, er: 0, so: 0, bb: 0 };
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
                        playerStats[pid].ab++; playerStats[pid].hits++; 
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
                pitcherStats[pid].outs += (parseInt(item.innings) || 0) * 3 + (parseInt(item.outs) || 0);
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
        } else s.avg = ".000";
        return s;
    });

    let pStatsArray = Object.values(pitcherStats).map(s => {
        let innFull = Math.floor(s.outs / 3);
        let innRem = s.outs % 3;
        s.ipDisplay = innRem > 0 ? `${innFull} ${innRem}/3` : `${innFull}`;
        s.era = s.outs > 0 ? ((s.er * 7 * 3) / s.outs).toFixed(2) : "-";
        return s;
    });

    if (currentStatsYear !== "all") {
        bStatsArray = bStatsArray.filter(s => s.games > 0);
        pStatsArray = pStatsArray.filter(s => s.games > 0);
    } else {
        bStatsArray = bStatsArray.filter(s => s.pa > 0 || s.games > 0);
        pStatsArray = pStatsArray.filter(s => s.outs > 0 || s.games > 0);
    }

    bStatsArray.sort((a, b) => { const avgA = parseFloat(a.avg) || 0; const avgB = parseFloat(b.avg) || 0; return avgB !== avgA ? avgB - avgA : b.pa - a.pa; });
    pStatsArray.sort((a, b) => { const eraA = a.era === "-" ? 999 : parseFloat(a.era); const eraB = b.era === "-" ? 999 : parseFloat(b.era); return eraA - eraB; });

    let html = filterHtml + `<h3 class="stats-h3 mt-10">打撃成績</h3>`;
    html += `
        <div class="table-container">
            <table>
                <thead>
                    <tr><th>背番</th><th class="th-left">氏名</th><th>打率</th><th>試合</th><th>打席</th><th>打数</th><th>安打</th><th>本塁打</th><th>打点</th><th>盗塁</th><th>四死球</th><th>三振</th></tr>
                </thead>
                <tbody>
                    ${bStatsArray.map(s => `<tr><td>${s.number}</td><td class="td-left-bold">${s.name}</td><td class="td-highlight-green">${s.avg}</td><td>${s.games}</td><td>${s.pa}</td><td>${s.ab}</td><td>${s.hits}</td><td>${s.hr}</td><td>${s.rbi}</td><td>${s.sb}</td><td>${s.bb}</td><td>${s.so}</td></tr>`).join('')}
                </tbody>
            </table>
        </div>
    `;

    html += `<h3 class="stats-h3 mt-25">投手成績</h3>`;
    if (pStatsArray.length === 0) {
        html += `<p class="empty-text">投手記録がありません。</p>`;
    } else {
        html += `
            <div class="table-container">
                <table>
                    <thead><tr><th>背番</th><th class="th-left">氏名</th><th>防御率</th><th>登板</th><th>投球回</th><th>自責点</th><th>奪三振</th><th>四死球</th></tr></thead>
                    <tbody>
                        ${pStatsArray.map(s => `<tr><td>${s.number}</td><td class="td-left-bold">${s.name}</td><td class="td-highlight-blue">${s.era}</td><td>${s.games}</td><td>${s.ipDisplay}</td><td>${s.er}</td><td>${s.so}</td><td>${s.bb}</td></tr>`).join('')}
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
