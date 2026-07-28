const SUPABASE_URL = "https://kgwgyxbkyddlmhezxiwn.supabase.co/";
const SUPABASE_ANON_KEY = "sb_publishable_CPjg5G9P9_j9omT4LxH7DQ_S-FKlArB";

const cloudEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
const db = cloudEnabled ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

let currentUser = null;
let currentProfile = null;

function setAuthMessage(message = "", isSuccess = false) {
  const el = document.getElementById("authMessage");

  if (!el) return;

  el.textContent = message;
  el.style.color = isSuccess
    ? "var(--ok)"
    : "var(--danger)";
}

function setAuthLoading(isLoading) {
  const buttons = document.querySelectorAll(
    "#authScreen button"
  );

  buttons.forEach(button => {
    button.disabled = isLoading;
  });
}

function showAuthScreen() {
  const authScreen = document.getElementById("authScreen");
  const appView = document.getElementById("appView");

  if (authScreen) {
    authScreen.style.display = "flex";
  }

  if (appView) {
    appView.hidden = true;
  }
}

async function showAppScreen(user) {
  currentUser = user;

  const authScreen = document.getElementById("authScreen");

  if (authScreen) {
    authScreen.style.display = "none";
  }

  await loadCurrentProfile();
  renderCurrentUser();

  /*
    appView는 여기서 열지 않음.
    기존 '체크리스트 열기' 기능이 여행방 입장 후 열도록 둔다.
  */
}

async function loadCurrentProfile() {
  if (!currentUser) return;

  const { data, error } = await db
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (error) {
    console.error("프로필 조회 오류:", error);
    return;
  }

  if (data) {
    currentProfile = data;
    return;
  }

  const displayName =
    currentUser.user_metadata?.display_name ||
    currentUser.email?.split("@")[0] ||
    "여행자";

  const { data: newProfile, error: insertError } = await db
    .from("profiles")
    .insert({
      id: currentUser.id,
      display_name: displayName
    })
    .select()
    .single();

  if (insertError) {
    console.error("프로필 생성 오류:", insertError);
    return;
  }

  currentProfile = newProfile;
}

function renderCurrentUser() {
  const nameEl = document.getElementById("currentUserName");

  if (!nameEl) return;

  const displayName =
    currentProfile?.display_name ||
    currentUser?.user_metadata?.display_name ||
    currentUser?.email?.split("@")[0] ||
    "여행자";

  nameEl.textContent = `${displayName}`;
}

async function signUp() {
  const name = document
    .getElementById("authName")
    ?.value
    .trim();

  const email = document
    .getElementById("authEmail")
    ?.value
    .trim();

  const password = document
    .getElementById("authPassword")
    ?.value;

  if (!name) {
    return setAuthMessage("사용할 이름을 입력해 주세요.");
  }

  if (!email) {
    return setAuthMessage("이메일을 입력해 주세요.");
  }

  if (!password || password.length < 6) {
    return setAuthMessage("비밀번호는 6자 이상 입력해 주세요.");
  }

  setAuthLoading(true);
  setAuthMessage("");

  try {
    const { data, error } = await db.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: name
        }
      }
    });

    if (error) throw error;

    const user = data.user;

    if (!user) {
      throw new Error("회원 정보를 만들지 못했습니다.");
    }

    /*
      이메일 확인 설정이 켜져 있으면
      회원가입 직후 session이 없을 수 있다.
    */
    if (!data.session) {
      setAuthMessage(
        "회원가입 완료! 이메일 인증 후 로그인해 주세요.",
        true
      );

      return;
    }

    const { error: profileError } = await db
      .from("profiles")
      .upsert(
        {
          id: user.id,
          display_name: name,
          updated_at: new Date().toISOString()
        },
        {
          onConflict: "id"
        }
      );

    if (profileError) throw profileError;

    setAuthMessage("회원가입이 완료되었습니다.", true);
    await showAppScreen(user);

  } catch (error) {
    console.error("회원가입 오류:", error);
    setAuthMessage(
      getAuthErrorMessage(error)
    );

  } finally {
    setAuthLoading(false);
  }
}

async function signIn() {
  const email = document
    .getElementById("authEmail")
    ?.value
    .trim();

  const password = document
    .getElementById("authPassword")
    ?.value;

  if (!email || !password) {
    return setAuthMessage(
      "이메일과 비밀번호를 모두 입력해 주세요."
    );
  }

  setAuthLoading(true);
  setAuthMessage("");

  try {
    const { data, error } =
      await db.auth.signInWithPassword({
        email,
        password
      });

    if (error) throw error;

    await showAppScreen(data.user);

  } catch (error) {
    console.error("로그인 오류:", error);
    setAuthMessage(
      getAuthErrorMessage(error)
    );

  } finally {
    setAuthLoading(false);
  }
}

async function signOut() {
  const { error } = await db.auth.signOut();

  if (error) {
    console.error("로그아웃 오류:", error);
    return;
  }

  currentUser = null;
  currentProfile = null;

  showAuthScreen();
  setAuthMessage("로그아웃되었습니다.", true);
}

function getAuthErrorMessage(error) {
  const message = error?.message || "";

  if (message.includes("Invalid login credentials")) {
    return "이메일 또는 비밀번호가 맞지 않습니다.";
  }

  if (message.includes("Email not confirmed")) {
    return "이메일 인증을 먼저 완료해 주세요.";
  }

  if (message.includes("User already registered")) {
    return "이미 가입된 이메일입니다.";
  }

  if (message.includes("Password should be")) {
    return "비밀번호는 6자 이상 입력해 주세요.";
  }

  if (message.includes("Unable to validate email address")) {
    return "이메일 주소를 다시 확인해 주세요.";
  }

  return message || "처리 중 오류가 발생했습니다.";
}

async function initializeAuth() {
  const {
    data: { session },
    error
  } = await db.auth.getSession();

  if (error) {
    console.error("세션 확인 오류:", error);
    showAuthScreen();
    return;
  }

  if (session?.user) {
    await showAppScreen(session.user);
  } else {
    showAuthScreen();
  }
}

db.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT") {
    currentUser = null;
    currentProfile = null;
    showAuthScreen();
  }
});

initializeAuth();

const state = {
  roomCode: localStorage.getItem("tripRoomCode") || "",
  trip: null,
  categories: [],
  participants: [],
  itemLogs: [],
  dayLogs: [],
  items: [],
  itemLinks: [],

  ui: {
    selectedCategory: "전체",
    selectedSection: "plan",
  },

  channel: null
};

const UI_STORAGE_KEY = "tripUIState";

function saveUIState(){
  localStorage.setItem(
    UI_STORAGE_KEY,
    JSON.stringify(state.ui)
  );
}

function loadUIState(){
  try {
    const saved = JSON.parse(
      localStorage.getItem(UI_STORAGE_KEY) || "{}"
    );

    state.ui = {
      ...state.ui,
      ...saved
    };
  } catch (error) {
    console.warn("UI 상태 불러오기 실패:", error);
    localStorage.removeItem(UI_STORAGE_KEY);
  }
}

loadUIState();

let editingItemLogId = null;
let editingDayLogDate = null;
const openScheduleDates = new Set(
  state.ui.openScheduleDates || []
);
const openDayLogs = new Set();

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function toast(msg){
  const el=$("#toast"); el.textContent=msg; el.classList.add("show");
  clearTimeout(toast.t); toast.t=setTimeout(()=>el.classList.remove("show"),1700);
}

function roomKey(){return `tripChecklist:${state.roomCode}`}
function defaultTrip(){return {room_code:state.roomCode,name:"우리들의 여행",destination:"",start_date:null,end_date:null}}
function defaultCategories(){return ["예약","공동 준비","개인 짐","아이들","먹거리","차량"].map((name,i)=>({id:uid(),room_code:state.roomCode,name,sort_order:i}))}
function defaultParticipants(){return ["혜정","다연이네","친구네"].map((name,i)=>({id:uid(),room_code:state.roomCode,name,sort_order:i}))}
function defaultItems(){
  const reservationDate = new Date(Date.now()+86400000*7).toISOString().slice(0,10);
  return [
    {id:uid(),room_code:state.roomCode,section_type:"plan",schedule_date:null,schedule_time:null,schedule_place:"",title:"숙소 예약",category_name:"예약",owner:"공동",note:"방 2개 확인",done:false,reservation_required:true,reservation_done:false,reservation_date:"",reservation_time:"",reservation_place:"",reservation_number:"",reservation_note:"",reservation_image_url:""},
    {id:uid(),room_code:state.roomCode,section_type:"plan",schedule_date:null,schedule_time:null,schedule_place:"",title:"아이들 수영복",category_name:"아이들",owner:"가족 A",note:"아이별 1벌씩",done:false,reservation_required:false,reservation_done:false},
    {id:uid(),room_code:state.roomCode,section_type:"plan",schedule_date:null,schedule_time:null,schedule_place:"",title:"렌터카 예약",category_name:"예약",owner:"가족 B",note:"7인승",done:true,reservation_required:true,reservation_done:true,reservation_date:reservationDate,reservation_time:"10:00",reservation_place:"제주렌터카",reservation_number:"DEMO-2026",reservation_note:"카시트 1개 포함",reservation_image_url:""}
  ]
}

function persistLocal(){
  if(!cloudEnabled)localStorage.setItem(roomKey(),JSON.stringify({trip:state.trip,categories:state.categories,participants:state.participants,items:state.items}))
}

async function openRoom(){
  state.roomCode=$("#roomCodeInput").value.trim().toUpperCase();
  if(!state.roomCode)return toast("여행 코드를 입력해 주세요.");
  localStorage.setItem("tripRoomCode",state.roomCode);

  if(!cloudEnabled){
    const saved=JSON.parse(localStorage.getItem(roomKey())||"null");
    state.trip=saved?.trip||defaultTrip();
    state.categories=saved?.categories||defaultCategories();
    state.participants=saved?.participants||defaultParticipants();
    state.items=saved?.items||defaultItems();
    persistLocal();
    showApp();
    return;
  }

  const {data:trip,error:tripErr}=await db.from("trips").select("*").eq("room_code",state.roomCode).maybeSingle();
  if(tripErr)return toast(tripErr.message);
  if(!trip){
    const {data,error}=await db.from("trips").insert(defaultTrip()).select().single();
    if(error)return toast(error.message);
    state.trip=data;
    await db.from("trip_categories").insert(defaultCategories().map(({id,...c})=>c));
    await db.from("trip_participants").insert(defaultParticipants().map(({id,...p})=>p));
  } else state.trip=trip;

  await reloadCloud();
  subscribeRoom();
  showApp();
}

async function reloadCloud() {
  const [
    { data: cats, error: catErr },
    { data: participants, error: partErr },
    { data: items, error: itemErr },
    { data: links, error: linkErr }
  ] = await Promise.all([
    db
      .from("trip_categories")
      .select("*")
      .eq("room_code", state.roomCode)
      .order("sort_order"),

    db
      .from("trip_participants")
      .select("*")
      .eq("room_code", state.roomCode)
      .order("sort_order"),

    db
      .from("trip_items")
      .select("*")
      .eq("room_code", state.roomCode)
      .order("created_at"),

    db
      .from("trip_item_links")
      .select("*")
      .eq("room_code", state.roomCode)
      .order("sort_order")
      .order("created_at")
  ]);

  const error = catErr || partErr || itemErr || linkErr;

  if (error) {
    return toast(error.message);
  }

  const creatorIds = [
    ...new Set(
      (items || [])
        .map(item => item.created_by)
        .filter(Boolean)
    )
  ];

  let profileMap = {};

  if (creatorIds.length > 0) {
    const {
      data: profiles,
      error: profileErr
    } = await db
      .from("profiles")
      .select("id, display_name")
      .in("id", creatorIds);

    if (profileErr) {
      console.error("작성자 조회 오류:", profileErr);
    } else {
      profileMap = Object.fromEntries(
        (profiles || []).map(profile => [
          profile.id,
          profile.display_name
        ])
      );
    }
  }

  state.categories = cats || [];
  state.participants = participants || [];

  state.items = (items || []).map(item => ({
    ...item,
    creator_name:
      profileMap[item.created_by] || ""
  }));

  state.itemLinks = links || [];

  render();
}



function subscribeRoom(){
  if(state.channel)db.removeChannel(state.channel);
  state.channel=db.channel(`trip-${state.roomCode}`)
    .on("postgres_changes",{event:"*",schema:"public",table:"trip_items",filter:`room_code=eq.${state.roomCode}`},reloadCloud)
    .on("postgres_changes",{event:"*",schema:"public",table:"trip_categories",filter:`room_code=eq.${state.roomCode}`},reloadCloud)
    .on("postgres_changes",{event:"*",schema:"public",table:"trip_participants",filter:`room_code=eq.${state.roomCode}`},reloadCloud)
    .subscribe();
}

function showApp(){
  $("#joinView").hidden=true; $("#appView").hidden=false; render();
}

function ownerName(owner){
  return owner || "";
}

function render(){
  if(!state.trip)return;
  $("#tripTitle").textContent=state.trip.name;
  $("#roomLabel").textContent=`여행 코드 ${state.roomCode}`;
  $("#tripDestinationInput").value=state.trip.destination||"";
  $("#tripStartDateInput").value=state.trip.start_date||"";
  $("#tripEndDateInput").value=state.trip.end_date||"";
  renderMainTabs(); renderCategories(); renderParticipants(); renderItems(); renderSettings();
}

function renderMainTabs(){
  $$(".main-tab").forEach(btn => {
    btn.classList.toggle(
      "active",
      btn.dataset.section === state.ui.selectedSection
    );

    btn.onclick = () => {
      state.ui.selectedSection = btn.dataset.section;
      state.ui.selectedCategory = "전체";
      saveUIState();
      render();
    };
  });
}

function renderCategories() {
  const sectionCategories = state.categories.filter(
    category =>
      (category.section_type || "plan") === state.ui.selectedSection
  );

  const names = [
    "전체",
    ...sectionCategories.map(category => category.name)
  ];

  if (!names.includes(state.ui.selectedCategory)) {
    state.ui.selectedCategory = "전체";
  }

  $("#categoryTabs").innerHTML = names
    .map(name => `
      <button
        class="category-tab ${
          name === state.ui.selectedCategory ? "active" : ""
        }"
        data-category="${esc(name)}"
      >
        ${esc(name)}
      </button>
    `)
    .join("");

  $("#categoryTabs")
    .querySelectorAll("button")
    .forEach(button => {
      button.onclick = () => {
        state.ui.selectedCategory = button.dataset.category;
        saveUIState();
        render();
      };

  $("#itemCategoryInput").innerHTML = sectionCategories
    .map(category => `
      <option value="${esc(category.name)}">
        ${esc(category.name)}
      </option>
    `)
    .join("");

  $("#categoryManageList").innerHTML = sectionCategories.length
    ? sectionCategories
        .map(category => `
          <div
            class="category-row"
            data-category-row="${category.id}"
          >
            <strong>${esc(category.name)}</strong>

            <div>
              <button
                type="button"
                class="edit-category"
                data-edit-category="${category.id}"
                data-name="${esc(category.name)}"
              >
                수정
              </button>

              <button
                type="button"
                class="delete-category"
                data-id="${category.id}"
                data-name="${esc(category.name)}"
              >
                삭제
              </button>
            </div>
          </div>
        `)
        .join("")
    : `<div class="empty">이 탭의 카테고리가 없습니다.</div>`;

  $("#categoryManageList")
    .querySelectorAll(".edit-category")
    .forEach(button => {
      button.onclick = () =>
        startCategoryEdit(
          button.dataset.editCategory,
          button.dataset.name
        );
    });

  $("#categoryManageList")
    .querySelectorAll(".delete-category")
    .forEach(button => {
      button.onclick = () =>
        deleteCategory(
          button.dataset.id,
          button.dataset.name
        );
    });
  });
}

function getItemLog(itemId) {
  return state.itemLogs.find(log => String(log.item_id) === String(itemId));
}

function getDayLog(logDate) {
  return state.dayLogs.find(log => log.log_date === logDate);
}

async function saveItemLog(itemId) {
  const textarea = document.querySelector(
    `[data-item-log-input="${itemId}"]`
  );

  if (!textarea) return;

  const logContent = textarea.value.trim();

  if (!logContent) {
    return toast("기록 내용을 입력해 주세요.");
  }

  const { data, error } = await db
    .from("trip_item_logs")
    .upsert(
      {
        room_code: state.roomCode,
        item_id: itemId,
        log_content: logContent
      },
      {
        onConflict: "room_code,item_id"
      }
    )
    .select()
    .single();

  if (error) return toast(error.message);

  const index = state.itemLogs.findIndex(
    log => String(log.item_id) === String(itemId)
  );

  if (index >= 0) {
    state.itemLogs[index] = data;
  } else {
    state.itemLogs.push(data);
  }

  editingItemLogId = null;
  renderItems();
  toast("일정 기록을 저장했어요.");
}

async function saveDayLog(logDate) {
  const textarea = document.querySelector(
    `[data-day-log-input="${logDate}"]`
  );

  if (!textarea) return;

  const logContent = textarea.value.trim();

  if (!logContent) {
    return toast("자유 기록 내용을 입력해 주세요.");
  }

  const { data, error } = await db
    .from("trip_day_logs")
    .upsert(
      {
        room_code: state.roomCode,
        log_date: logDate,
        log_content: logContent
      },
      {
        onConflict: "room_code,log_date"
      }
    )
    .select()
    .single();

  if (error) return toast(error.message);

  const index = state.dayLogs.findIndex(
    log => log.log_date === logDate
  );

  if (index >= 0) {
    state.dayLogs[index] = data;
  } else {
    state.dayLogs.push(data);
  }

  editingDayLogDate = null;
  openDayLogs.add(logDate);
  renderItems();
  toast("자유 기록을 저장했어요.");
}

function editItemLog(itemId) {
  const item = state.items.find(
    item => String(item.id) === String(itemId)
  );

  if (item?.schedule_date) {
    openScheduleDates.add(item.schedule_date);
  }

  editingItemLogId = String(itemId);
  renderItems();
}

function cancelItemLogEdit() {
  editingItemLogId = null;
  renderItems();
}

function editDayLog(logDate) {
  openScheduleDates.add(logDate);
  editingDayLogDate = logDate;
  renderItems();
}

function cancelDayLogEdit() {
  editingDayLogDate = null;
  renderItems();
}

async function deleteItemLog(logId) {
  if (!confirm("이 일정의 기록을 삭제할까요?")) return;

  const { error } = await db
    .from("trip_item_logs")
    .delete()
    .eq("id", logId);

  if (error) return toast(error.message);

  state.itemLogs = state.itemLogs.filter(
    log => String(log.id) !== String(logId)
  );

  editingItemLogId = null;
  renderItems();
  toast("일정 기록을 삭제했어요.");
}

async function deleteDayLog(logId) {
  if (!confirm("그날의 자유 기록을 삭제할까요?")) return;

  const { error } = await db
    .from("trip_day_logs")
    .delete()
    .eq("id", logId);

  if (error) return toast(error.message);

  state.dayLogs = state.dayLogs.filter(
    log => String(log.id) !== String(logId)
  );

  editingDayLogDate = null;
  renderItems();
  toast("자유 기록을 삭제했어요.");
}

function renderItems() {
  const sectionItems = state.items.filter(
    item => (item.section_type || "plan") === state.ui.selectedSection
  );

  const shown = sectionItems.filter(
    item =>
      state.ui.selectedCategory === "전체" ||
      item.category_name === state.ui.selectedCategory
  );

  const baseTitle =
    state.ui.selectedSection === "plan"
      ? "여행 계획"
      : "여행 일정";

  $("#listTitle").textContent =
    state.ui.selectedCategory === "전체"
      ? baseTitle
      : `${baseTitle} · ${state.ui.selectedCategory}`;

  const done = sectionItems.filter(item => item.done).length;
  const total = sectionItems.length;

  $("#progressText").textContent = `${done} / ${total}`;
  $("#progressBar").style.width =
    `${total ? Math.round(done / total * 100) : 0}%`;

  function renderItemCard(item) {
    const reservation = item.reservation_required
      ? `
        <div class="reservation-box">
          <strong>
            ${item.reservation_done ? "예약 완료" : "예약 필요"}
          </strong>

          ${
            item.reservation_date || item.reservation_time
              ? `
                <div>
                  ${esc(item.reservation_date || "")}
                  ${esc(item.reservation_time || "")}
                </div>
              `
              : ""
          }

          ${
            item.reservation_place
              ? `<div>예약처: ${esc(item.reservation_place)}</div>`
              : ""
          }

          ${
            item.reservation_number
              ? `<div>예약번호: ${esc(item.reservation_number)}</div>`
              : ""
          }

          ${
            item.reservation_note
              ? `<div>${esc(item.reservation_note)}</div>`
              : ""
          }

          ${
            item.reservation_image_url
              ? `
                <a
                  class="reservation-image-link"
                  href="${esc(item.reservation_image_url)}"
                  target="_blank"
                  rel="noopener"
                >
                  <img
                    src="${esc(item.reservation_image_url)}"
                    alt="예약 첨부 이미지"
                  >
                </a>
              `
              : ""
          }
        </div>
      `
      : "";

    const mapUrl = item.schedule_place
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          item.schedule_place
        )}`
      : "";

    let scheduleInfo = "";

    if ((item.section_type || "plan") === "schedule") {
      scheduleInfo = `
        <div class="schedule-date">
          ${esc(item.schedule_date || "날짜 미정")}
          ${esc(item.schedule_time || "")}
        </div>

        <div class="item-title">
          ${esc(item.title)}
        </div>

        ${
          item.schedule_place
            ? `
              <div class="schedule-location-row">
                <span class="schedule-place">
                  📍 ${esc(item.schedule_place)}
                </span>

                <a
                  class="map-link"
                  href="${mapUrl}"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  지도에서 보기
                </a>
              </div>
            `
            : ""
        }
      `;
    }

    const itemLog = getItemLog(item.id);

    const isEditingItemLog =
      editingItemLogId === String(item.id);

    const logArea =
      (item.section_type || "plan") === "schedule"
        ? `
          <div class="item-log-box">
            <div class="item-log-editor">
              ${
                !itemLog || isEditingItemLog
                  ? `
                    <textarea
                      data-item-log-input="${item.id}"
                      placeholder="실제로 한 일, 비용, 느낀 점 등을 자유롭게 기록하세요."
                    >${esc(itemLog?.log_content || "")}</textarea>

                    <div class="log-button-row">
                      <button
                        class="save-log-btn"
                        data-save-item-log="${item.id}"
                      >
                        ${itemLog ? "수정 저장" : "기록 저장"}
                      </button>

                      ${
                        itemLog
                          ? `
                            <button
                              class="cancel-log-btn"
                              data-cancel-item-log
                            >
                              취소
                            </button>
                          `
                          : ""
                      }
                    </div>
                  `
                  : `
                    <div class="saved-log-content">${esc(itemLog.log_content)}</div>

                    <div class="saved-log-actions">
                      <button
                        class="mini-log-btn"
                        data-edit-item-log="${item.id}"
                      >
                        수정
                      </button>

                      <button
                        class="mini-log-btn danger"
                        data-delete-item-log="${itemLog.id}"
                      >
                        삭제
                      </button>
                    </div>
                  `
              }
            </div>
          </div>
        `
        : "";

    const itemLinks = (state.itemLinks || []).filter(
      link => String(link.item_id) === String(item.id)
    );

    const linkRow = `
      <div class="candidate-link-row">
        <span class="candidate-link-label">참고</span>

        <div class="candidate-link-list">
          ${
            itemLinks.length
              ? itemLinks
                  .map(
                    link => `
                      <span class="candidate-link-item">
                        <a
                          href="${esc(link.url)}"
                          target="_blank"
                          rel="noopener noreferrer"
                          title="${esc(link.title)}"
                        >
                          ${esc(link.title)}
                        </a>

                        <div class="candidate-link-actions">
                          <button
                            type="button"
                            data-link-edit="${link.id}"
                            aria-label="참고 수정"
                          >
                            수정
                          </button>

                          <button
                            type="button"
                            class="danger"
                            data-link-delete="${link.id}"
                            aria-label="참고 삭제"
                          >
                            삭제
                          </button>
                        </div>
                      </span>
                      `
                    )
                  .join("")
              : `<span class="candidate-link-empty">등록된 참고 없음</span>`
          }

          <button
            type="button"
            class="candidate-add-btn"
            data-link-add="${item.id}"
          >
            ＋
          </button>
        </div>
      </div>
    `;        

    return `
      <article
        class="item-card
        ${(item.section_type || "plan") === "schedule"
          ? "schedule-item"
          : ""}
        ${item.done ? "done" : ""}"
      >
        <button
          class="check-btn ${item.done ? "checked" : ""}"
          data-check="${item.id}"
        >
          ${item.done ? "✓" : ""}
        </button>

        <div class="item-main">
          ${scheduleInfo}

          ${
            (item.section_type || "plan") !== "schedule"
              ? `
                <div class="item-title">
                  ${esc(item.title)}
                </div>
              `
              : ""
          }

          ${
            item.note
              ? `<p class="item-note">${esc(item.note)}</p>`
              : ""
          }
          ${
            item.creator_name
              ? `
                <div class="item-creator">
                  ${esc(item.creator_name)} 작성
                </div>
              `
              : ""
          }

          <div class="meta">
            <span class="badge category">
              ${esc(item.category_name)}
            </span>

            ${
              item.owner
                ? `
                  <span class="badge owner">
                    ${esc(item.owner.replaceAll(",", ", "))}
                  </span>
                `
                : ""
            }
            ${
              item.reservation_required
                ? `
                  <span
                    class="badge reserve
                    ${item.reservation_done ? "done" : ""}"
                  >
                    ${
                      item.reservation_done
                        ? "예약 완료"
                        : "예약 필요"
                    }
                  </span>
                `
                : ""
            }
          </div>

        ${reservation}
        ${item.reservation_required ? linkRow : ""}
        ${logArea}
        </div>

        <div class="actions">
          <button
            class="mini-btn"
            data-edit="${item.id}"
            aria-label="수정"
          >
            ✏️
          </button>

          <button
            class="mini-btn"
            data-delete="${item.id}"
            aria-label="삭제"
          >
            🗑️
          </button>
        </div>
      </article>
    `;
  }

  if (!shown.length) {
    $("#checklist").innerHTML = `
      <div class="empty">
        등록된 항목이 없습니다.<br>
        새 항목을 추가해 보세요.
      </div>
    `;
  } else if (state.ui.selectedSection === "schedule") {
    const grouped = {};

    shown.forEach(item => {
      const dateKey = item.schedule_date || "날짜 미정";

      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }

      grouped[dateKey].push(item);
    });

    const dateKeys = Object.keys(grouped).sort((a, b) => {
      if (a === "날짜 미정") return 1;
      if (b === "날짜 미정") return -1;
      return a.localeCompare(b);
    });

    $("#checklist").innerHTML = dateKeys
      .map((dateKey, index) => {
        const dateItems = grouped[dateKey];
        const dayLog = getDayLog(dateKey);

        return `
          <details
            class="schedule-day-group"
            data-schedule-date="${esc(dateKey)}"
            ${
              openScheduleDates.has(dateKey)
                ? "open"
                : ""
            }
          >
            <summary class="schedule-day-summary">
              <span>${esc(dateKey)}</span>
              <span class="schedule-day-count">
                일정 ${dateItems.length}개
              </span>
            </summary>

            <div class="schedule-day-content">
              ${dateItems.map(renderItemCard).join("")}

              ${
                dateKey !== "날짜 미정"
                  ? `
                  <details
                    class="day-log-box"
                    data-day-log-date="${dateKey}"
                    ${
                      editingDayLogDate === dateKey ||
                      openDayLogs.has(dateKey)
                        ? "open"
                        : ""
                    }
                  >
                  <summary>🗒️ Today's Notes</summary>

                  <div class="day-log-editor">
                        ${
                          !dayLog || editingDayLogDate === dateKey
                            ? `
                              <textarea
                                data-day-log-input="${dateKey}"
                                placeholder="예정에 없던 장소, 음식, 비용, 그날 전체 이야기를 자유롭게 기록하세요."
                              >${esc(dayLog?.log_content || "")}</textarea>

                              <div class="log-button-row">
                                <button
                                  class="save-log-btn"
                                  data-save-day-log="${dateKey}"
                                >
                                  ${dayLog ? "수정 저장" : "자유 기록 저장"}
                                </button>

                                ${
                                  dayLog
                                    ? `
                                      <button
                                        class="cancel-log-btn"
                                        data-cancel-day-log
                                      >
                                        취소
                                      </button>
                                    `
                                    : ""
                                }
                              </div>
                            `
                            : `
                              <div class="saved-log-content">${esc(dayLog.log_content)}</div>

                              <div class="saved-log-actions">
                                <button
                                  class="mini-log-btn"
                                  data-edit-day-log="${dateKey}"
                                >
                                  수정
                                </button>

                                <button
                                  class="mini-log-btn danger"
                                  data-delete-day-log="${dayLog.id}"
                                >
                                  삭제
                                </button>
                              </div>
                            `
                        }
                      </div>
                    </details>
                  `
                  : ""
              }
            </div>
          </details>
        `;
      })
      .join("");
  } else {
    $("#checklist").innerHTML =
      shown.map(renderItemCard).join("");
  }

  $$("[data-check]").forEach(button => {
    button.onclick = () =>
      toggleItem(button.dataset.check);
  });

  $$("[data-edit]").forEach(button => {
    button.onclick = () =>
      openItemDialog(button.dataset.edit);
  });

  $$("[data-delete]").forEach(button => {
    button.onclick = () =>
      deleteItem(button.dataset.delete);
  });

  $$("[data-save-item-log]").forEach(button => {
    button.onclick = () =>
      saveItemLog(button.dataset.saveItemLog);
  });

  $$("[data-save-day-log]").forEach(button => {
    button.onclick = () =>
      saveDayLog(button.dataset.saveDayLog);
  });

  $$("[data-edit-item-log]").forEach(button => {
    button.onclick = () =>
    editItemLog(button.dataset.editItemLog);
  });

  $$("[data-delete-item-log]").forEach(button => {
    button.onclick = () =>
      deleteItemLog(button.dataset.deleteItemLog);
  });

  $$("[data-cancel-item-log]").forEach(button => {
    button.onclick = cancelItemLogEdit;
  });

  $$("[data-edit-day-log]").forEach(button => {
    button.onclick = () =>
      editDayLog(button.dataset.editDayLog);
  });

  $$("[data-delete-day-log]").forEach(button => {
    button.onclick = () =>
      deleteDayLog(button.dataset.deleteDayLog);
  });

  $$("[data-cancel-day-log]").forEach(button => {
    button.onclick = cancelDayLogEdit;
  });

  $$("[data-schedule-date]").forEach(group => {
    group.ontoggle = () => {
      const dateKey = group.dataset.scheduleDate;

      if (!dateKey) return;

      if (group.open) {
        openScheduleDates.add(dateKey);
      } else {
        openScheduleDates.delete(dateKey);
      }
    state.ui.openScheduleDates = [...openScheduleDates];
    saveUIState();
    };
  });

  $$("[data-day-log-date]").forEach(group => {
  group.ontoggle = () => {
    const logDate = group.dataset.dayLogDate;

    if (!logDate) return;

    if (group.open) {
      openDayLogs.add(logDate);
    } else {
      openDayLogs.delete(logDate);
    }
  };
});
    
} //renderitems 끝

function renderOwnerCheckboxes(selectedOwners = []) {
  const ownerBox = $("#itemOwnerInput");

  if (!ownerBox) return;

  if (!state.participants.length) {
    ownerBox.innerHTML =
      `<span class="muted">등록된 참여자가 없습니다.</span>`;
    return;
  }

  ownerBox.innerHTML = state.participants
    .map(participant => {
      const checked = selectedOwners.includes(participant.name)
        ? "checked"
        : "";

      return `
        <label class="owner-checkbox">
          <input
            type="checkbox"
            name="itemOwner"
            value="${esc(participant.name)}"
            ${checked}
          >
          <span>${esc(participant.name)}</span>
        </label>
      `;
    })
    .join("");
}

function openItemDialog(id = "") {
  $("#itemForm").reset();
  $("#editingItemId").value = id;

  const item = state.items.find(i => i.id === id);

  $("#itemDialogTitle").textContent =
    item ? "항목 수정" : "항목 추가";

  $("#itemSectionInput").value =
    item?.section_type || state.ui.selectedSection;

  // 기존 담당자 문자열을 배열로 변환
  // 예: "다연,윤하" → ["다연", "윤하"]
  const selectedOwners = item?.owner
    ? item.owner
        .split(",")
        .map(name => name.trim())
        .filter(Boolean)
    : [];

  // 담당자 체크박스 생성
  $("#itemOwnerInput").innerHTML =
    state.participants.length
      ? state.participants
          .map(
            participant => `
              <label class="owner-checkbox">
                <input
                  type="checkbox"
                  name="itemOwner"
                  value="${esc(participant.name)}"
                  ${
                    selectedOwners.includes(participant.name)
                      ? "checked"
                      : ""
                  }
                >
                <span>${esc(participant.name)}</span>
              </label>
            `
          )
          .join("")
      : `<span class="muted">등록된 담당자가 없어요.</span>`;

  if (item) {
    $("#itemTitleInput").value = item.title || "";
    $("#scheduleDateInput").value =
      item.schedule_date || "";
    $("#scheduleTimeInput").value =
      item.schedule_time || "";
    $("#schedulePlaceInput").value =
      item.schedule_place || "";

    $("#itemCategoryInput").value =
      item.category_name ||
      state.categories[0]?.name ||
      "";

    $("#itemNoteInput").value = item.note || "";

    $("#reservationRequiredInput").checked =
      !!item.reservation_required;

    $("#reservationDoneInput").checked =
      !!item.reservation_done;

    $("#reservationDateInput").value =
      item.reservation_date || "";

    $("#reservationTimeInput").value =
      item.reservation_time || "";

    $("#reservationPlaceInput").value =
      item.reservation_place || "";

    $("#reservationNumberInput").value =
      item.reservation_number || "";

    $("#reservationNoteInput").value =
      item.reservation_note || "";

    $("#reservationImageValue").value =
      item.reservation_image_url || "";
  }

  if (!item) {
    $("#reservationImageValue").value = "";
  }

  updateReservationImagePreview();
  updateItemSectionFields();
  updateReservationFields();

  $("#itemDialog").showModal();
}

function updateItemSectionFields(){
  const isSchedule=$("#itemSectionInput").value==="schedule";
  $("#scheduleFields").hidden=!isSchedule;
  $("#itemTitleLabel").textContent=isSchedule?"일정 이름":"준비 항목";
  $("#itemTitleInput").placeholder=isSchedule?"예: 해수욕장 이동":"예: 렌터카 예약";
}

function updateReservationFields(){
  $("#reservationFields").hidden=!$("#reservationRequiredInput").checked;
}

function updateReservationImagePreview(){
  const value=$("#reservationImageValue").value;
  const preview=$("#reservationImagePreview");
  const img=$("#reservationPreviewImg");
  if(value){
    img.src=value;
    preview.hidden=false;
  }else{
    img.removeAttribute("src");
    preview.hidden=true;
  }
}

function resizeImageToDataUrl(file,maxWidth=1400,quality=.82){
  return new Promise((resolve,reject)=>{
    if(!file.type.startsWith("image/"))return reject(new Error("이미지 파일만 첨부할 수 있어요."));
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error("사진을 읽지 못했어요."));
    reader.onload=()=>{
      const img=new Image();
      img.onerror=()=>reject(new Error("사진을 불러오지 못했어요."));
      img.onload=()=>{
        const scale=Math.min(1,maxWidth/img.width);
        const canvas=document.createElement("canvas");
        canvas.width=Math.max(1,Math.round(img.width*scale));
        canvas.height=Math.max(1,Math.round(img.height*scale));
        const ctx=canvas.getContext("2d");
        ctx.drawImage(img,0,0,canvas.width,canvas.height);
        resolve(canvas.toDataURL("image/jpeg",quality));
      };
      img.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function storeReservationImage(file){
  const dataUrl=await resizeImageToDataUrl(file);
  if(!cloudEnabled)return dataUrl;

  const blob=await (await fetch(dataUrl)).blob();
  const ext="jpg";
  const path=`${state.roomCode}/${Date.now()}-${uid()}.${ext}`;
  const {error}=await db.storage.from("trip-attachments").upload(path,blob,{
    contentType:"image/jpeg",
    upsert:false
  });
  if(error)throw error;
  const {data}=db.storage.from("trip-attachments").getPublicUrl(path);
  return data.publicUrl;
}

async function handleReservationImage(file){
  try{
    toast("사진 처리 중...");
    const url=await storeReservationImage(file);
    $("#reservationImageValue").value=url;
    updateReservationImagePreview();
    toast("사진을 첨부했어요.");
  }catch(error){
    toast(error.message||"사진 첨부에 실패했어요.");
  }
}

async function saveItem(e) {
  e.preventDefault();

  const id = $("#editingItemId").value;
  const reservationRequired =
    $("#reservationRequiredInput").checked;
  const sectionType = $("#itemSectionInput").value;

  // 체크된 담당자들을 배열로 가져오기
  const selectedOwners = [
    ...document.querySelectorAll(
      'input[name="itemOwner"]:checked'
    )
  ].map(input => input.value);

  const payload = {
    room_code: state.roomCode,
    section_type: sectionType,

    schedule_date:
      sectionType === "schedule"
        ? ($("#scheduleDateInput").value || null)
        : null,

    schedule_time:
      sectionType === "schedule"
        ? ($("#scheduleTimeInput").value || null)
        : null,

    schedule_place:
      sectionType === "schedule"
        ? $("#schedulePlaceInput").value.trim()
        : "",

    title: $("#itemTitleInput").value.trim(),
    category_name: $("#itemCategoryInput").value,

    // DB의 owner가 text이므로 쉼표로 연결해서 저장
    owner: selectedOwners.join(","),

    note: $("#itemNoteInput").value.trim(),

    reservation_required: reservationRequired,

    reservation_done:
      reservationRequired &&
      $("#reservationDoneInput").checked,

    reservation_date:
      reservationRequired
        ? ($("#reservationDateInput").value || null)
        : null,

    reservation_time:
      reservationRequired
        ? ($("#reservationTimeInput").value || null)
        : null,

    reservation_place:
      reservationRequired
        ? $("#reservationPlaceInput").value.trim()
        : "",

    reservation_number:
      reservationRequired
        ? $("#reservationNumberInput").value.trim()
        : "",

    reservation_note:
      reservationRequired
        ? $("#reservationNoteInput").value.trim()
        : "",

    reservation_image_url:
      reservationRequired
        ? $("#reservationImageValue").value
        : ""
  };

  if (!id) {
  if (!currentUser) {
    return toast("로그인이 필요합니다.");
  }

  payload.created_by = currentUser.id;
  }  

  if (!payload.title) {
    return toast("준비 항목을 입력해 주세요.");
  }

  if (!cloudEnabled) {
    if (id) {
      const idx = state.items.findIndex(
        item => item.id === id
      );

      if (idx === -1) {
        return toast("수정할 항목을 찾지 못했어요.");
      }

      state.items[idx] = {
        ...state.items[idx],
        ...payload
      };
    } else {
      state.items.push({
        id: uid(),
        done: false,
        ...payload
      });
    }

    persistLocal();
    render();
  } else {
    const query = id
      ? db
          .from("trip_items")
          .update(payload)
          .eq("id", id)
      : db
          .from("trip_items")
          .insert(payload);

    const { error } = await query;

    if (error) {
      return toast(error.message);
    }

    await reloadCloud();
  }

  $("#itemDialog").close();
  toast(id ? "수정했어요." : "추가했어요.");
}

async function toggleItem(id){
  const item=state.items.find(i=>i.id===id);if(!item)return;
  if(!cloudEnabled){item.done=!item.done;persistLocal();render()}
  else{const {error}=await db.from("trip_items").update({done:!item.done}).eq("id",id);if(error)return toast(error.message);await reloadCloud()}
}
async function deleteItem(id){
  if(!confirm("이 항목을 삭제할까요?"))return;
  if(!cloudEnabled){state.items=state.items.filter(i=>i.id!==id);persistLocal();render()}
  else{const {error}=await db.from("trip_items").delete().eq("id",id);if(error)return toast(error.message);await reloadCloud()}
  toast("삭제했어요.");
}
async function addCategory(event) {
  event.preventDefault();

  const name = $("#newCategoryInput").value.trim();

  if (!name) {
    return toast("카테고리 이름을 입력해 주세요.");
  }

  const sectionCategories = state.categories.filter(
    category =>
      (category.section_type || "plan") === state.ui.selectedSection
  );

  const duplicated = sectionCategories.some(
    category => category.name === name
  );

  if (duplicated) {
    return toast("현재 탭에 이미 있는 카테고리예요.");
  }

  const payload = {
    room_code: state.roomCode,
    name,
    sort_order: sectionCategories.length,
    section_type: state.ui.selectedSection
  };

  if (!cloudEnabled) {
    state.categories.push({
      id: uid(),
      ...payload
    });

    persistLocal();
    render();
  } else {
    const { error } = await db
      .from("trip_categories")
      .insert(payload);

    if (error) {
      return toast(error.message);
    }

    await reloadCloud();
  }

  $("#newCategoryInput").value = "";
  toast("카테고리를 추가했어요.");
}

function startCategoryEdit(id,currentName){
  const row=document.querySelector(`[data-category-row="${id}"]`);
  if(!row)return;
  row.classList.add("editing");
  row.innerHTML=`
    <input class="category-name-input" value="${esc(currentName)}" aria-label="카테고리 이름" />
    <button type="button" class="save-category">저장</button>
    <button type="button" class="delete-category">취소</button>`;
  row.querySelector(".save-category").onclick=()=>renameCategory(id,currentName,row.querySelector("input").value);
  row.querySelector(".delete-category").onclick=renderCategories;
  row.querySelector("input").focus();
}

async function renameCategory(id,oldName,newValue){
  const newName=newValue.trim();
  if(!newName)return toast("카테고리 이름을 입력해 주세요.");
  if(newName!==oldName&&state.categories.some(c=>c.name===newName))return toast("이미 있는 카테고리예요.");
  if(newName===oldName){renderCategories();return;}

  if(!cloudEnabled){
    const category=state.categories.find(c=>c.id===id);
    if(category)category.name=newName;
    state.items.forEach(item => {
      const itemSection = item.section_type || "plan";

      if (
        itemSection === state.ui.selectedSection &&
        item.category_name === oldName
      ) {
        item.category_name = newName;
      }
    }); 
    persistLocal();render();
  }else{
    const { error: itemError } = await db
      .from("trip_items")
      .update({
        category_name: newName
      })
      .eq("room_code", state.roomCode)
      .eq("section_type", state.ui.selectedSection)
      .eq("category_name", oldName);
    if(itemError)return toast(itemError.message);
    const {error:categoryError}=await db.from("trip_categories").update({name:newName}).eq("id",id);
    if(categoryError)return toast(categoryError.message);
    if(state.ui.selectedCategory===oldName)state.ui.selectedCategory=newName;
    await reloadCloud();
  }
  toast("카테고리 이름을 수정했어요.");
}

async function deleteCategory(id,name){
  if(state.categories.length===1)return toast("카테고리는 한 개 이상 필요해요.");
  const used=state.items.some(i=>i.category_name===name);
  if(used)return toast("사용 중인 카테고리예요. 항목을 먼저 옮겨 주세요.");
  if(!confirm(`'${name}' 카테고리를 삭제할까요?`))return;
  if(!cloudEnabled){state.categories=state.categories.filter(c=>c.id!==id);persistLocal();render()}
  else{const {error}=await db.from("trip_categories").delete().eq("id",id);if(error)return toast(error.message);await reloadCloud()}
  toast("카테고리를 삭제했어요.");
}

function renderParticipants() {
  const ownerBox = $("#itemOwnerInput");

  if (ownerBox) {
    // 현재 체크된 담당자들 기억
    const current = [
      ...ownerBox.querySelectorAll(
        'input[name="itemOwner"]:checked'
      )
    ].map(input => input.value);

    // 체크박스 다시 생성
    ownerBox.innerHTML = state.participants.length
      ? state.participants
          .map(
            participant => `
              <label class="owner-checkbox">
                <input
                  type="checkbox"
                  name="itemOwner"
                  value="${esc(participant.name)}"
                  ${
                    current.includes(participant.name)
                      ? "checked"
                      : ""
                  }
                >
                <span>${esc(participant.name)}</span>
              </label>
            `
          )
          .join("")
      : `<span class="muted">등록된 담당자가 없습니다.</span>`;
  }

  const list = $("#participantManageList");

  if (!list) return;

  list.innerHTML = state.participants.length
    ? state.participants
        .map(
          p => `
            <div class="category-row">
              <strong>${esc(p.name)}</strong>

              <button
                type="button"
                class="delete-category"
                data-participant-id="${p.id}"
                data-participant-name="${esc(p.name)}"
              >
                삭제
              </button>
            </div>
          `
        )
        .join("")
    : `<div class="empty">등록된 참여자가 없습니다.</div>`;

  list
    .querySelectorAll("[data-participant-id]")
    .forEach(btn => {
      btn.onclick = () =>
        deleteParticipant(
          btn.dataset.participantId,
          btn.dataset.participantName
        );
    });
}

async function addParticipant(){
  const input=$("#newParticipantInput");
  const name=input.value.trim();
  if(!name)return toast("참여자 이름을 입력해 주세요.");
  if(state.participants.some(p=>p.name===name))return toast("이미 등록된 이름이에요.");
  const payload={room_code:state.roomCode,name,sort_order:state.participants.length};
  if(!cloudEnabled){
    state.participants.push({id:uid(),...payload});
    persistLocal(); render();
  }else{
    const {error}=await db.from("trip_participants").insert(payload);
    if(error)return toast(error.message);
    await reloadCloud();
  }
  input.value="";
  toast("참여자를 추가했어요.");
}

async function deleteParticipant(id,name){
  const used=state.items.some(i=>i.owner===name);
  if(used)return toast("담당자로 지정된 항목이 있어 먼저 담당자를 해제해 주세요.");
  if(!confirm(`'${name}' 참여자를 삭제할까요?`))return;
  if(!cloudEnabled){
    state.participants=state.participants.filter(p=>p.id!==id);
    persistLocal(); render();
  }else{
    const {error}=await db.from("trip_participants").delete().eq("id",id);
    if(error)return toast(error.message);
    await reloadCloud();
  }
  toast("참여자를 삭제했어요.");
}

async function saveTripInfo(){
  const destination=$("#tripDestinationInput").value.trim();
  const startDate=$("#tripStartDateInput").value||null;
  const endDate=$("#tripEndDateInput").value||null;

  if(startDate&&endDate&&endDate<startDate){
    return toast("도착일은 출발일보다 빠를 수 없어요.");
  }

  const payload={
    destination,
    start_date:startDate,
    end_date:endDate
  };

  if(!cloudEnabled){
    state.trip={...state.trip,...payload};
    persistLocal();
    render();
  }else{
    const {error}=await db.from("trips").update(payload).eq("room_code",state.roomCode);
    if(error)return toast(error.message);
    state.trip={...state.trip,...payload};
    render();
  }
  toast("여행 정보를 저장했어요.");
}

function renderSettings(){
  $("#tripNameInput").value=state.trip.name||"";
}

async function saveSettings(e){
  e.preventDefault();
  const payload={name:$("#tripNameInput").value.trim()||"우리들의 여행"};
  if(!cloudEnabled){state.trip={...state.trip,...payload};persistLocal();render()}
  else{const {error}=await db.from("trips").update(payload).eq("room_code",state.roomCode);if(error)return toast(error.message);state.trip={...state.trip,...payload};render()}
  $("#settingsDialog").close();toast("설정을 저장했어요.");
}

async function addItemLink(itemId) {
  const title = prompt("참고 이름을 입력하세요.\n예: 호텔 닛코 후쿠오카");

  if (!title?.trim()) return;

  let url = prompt("참고 링크를 붙여넣으세요.");

  if (!url?.trim()) return;

  url = url.trim();

  // https:// 없이 붙여넣어도 정상적으로 열리게
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  const sameItemLinks = (state.itemLinks || []).filter(
    link => String(link.item_id) === String(itemId)
  );

  const { error } = await db
    .from("trip_item_links")
    .insert({
      room_code: state.roomCode,
      item_id: itemId,
      title: title.trim(),
      url,
      sort_order: sameItemLinks.length
    });

  if (error) {
    return toast(error.message);
  }

  toast("참고 링크를 추가했어요.");
  await reloadCloud();
}

$("#joinBtn").onclick=openRoom;
$("#roomCodeInput").addEventListener("keydown",e=>{if(e.key==="Enter")openRoom()});
$("#addItemBtn").onclick=()=>openItemDialog();
$("#manageCategoriesBtn").onclick=()=>$("#categoryDialog").showModal();
$("#openSettingsBtn").onclick=()=>state.trip?$("#settingsDialog").showModal():toast("먼저 여행방에 들어가 주세요.");
if ($("#itemSectionInput")) {
  $("#itemSectionInput").onchange = updateItemSectionFields;
}
$("#reservationRequiredInput").onchange=updateReservationFields;
$("#itemForm").onsubmit=saveItem;
$("#categoryForm").onsubmit=addCategory;
$("#settingsForm").onsubmit=saveSettings;
if ($("#saveTripInfoBtn")) {
  $("#saveTripInfoBtn").onclick = saveTripInfo;
}
$("#addParticipantBtn").onclick=addParticipant;

function closeDialogFromButton(button){
  const dialog=button.closest("dialog");
  if(dialog?.open)dialog.close();
}

document.addEventListener("click", async e => {
  const linkAddBtn = e.target.closest("[data-link-add]");

  if (linkAddBtn) {
    e.preventDefault();

    const itemId = linkAddBtn.dataset.linkAdd;
    await addItemLink(itemId);
    return;
  }

  const linkEditBtn = e.target.closest("[data-link-edit]");

  if (linkEditBtn) {
    e.preventDefault();
    e.stopPropagation();

    await editItemLink(linkEditBtn.dataset.linkEdit);
    return;
  }

  const linkDeleteBtn = e.target.closest("[data-link-delete]");

  if (linkDeleteBtn) {
    e.preventDefault();
    e.stopPropagation();

    await deleteItemLink(linkDeleteBtn.dataset.linkDelete);
    return;
  }

  const closeButton = e.target.closest(
    "[data-close-dialog],.close-dialog"
  );

  if (closeButton) {
    e.preventDefault();
    e.stopPropagation();
    closeDialogFromButton(closeButton);
    return;
  }
});

async function editItemLink(linkId) {
  const link = (state.itemLinks || []).find(
    row => String(row.id) === String(linkId)
  );

  if (!link) {
    return toast("참고 링크를 찾지 못했어요.");
  }

  const title = prompt("참고 이름을 수정하세요.", link.title);
  if (!title?.trim()) return;

  let url = prompt("참고 링크를 수정하세요.", link.url);
  if (!url?.trim()) return;

  url = url.trim();

  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  const { error } = await db
    .from("trip_item_links")
    .update({
      title: title.trim(),
      url
    })
    .eq("id", link.id);

  if (error) {
    return toast(error.message);
  }

  toast("참고 링크를 수정했어요.");
  await reloadCloud();
}

async function deleteItemLink(linkId) {
  const link = (state.itemLinks || []).find(
    row => String(row.id) === String(linkId)
  );

  if (!link) {
    return toast("참고 링크를 찾지 못했어요.");
  }

  const ok = confirm(`"${link.title}" 참고를 삭제할까요?`);
  if (!ok) return;

  const { error } = await db
    .from("trip_item_links")
    .delete()
    .eq("id", link.id);

  if (error) {
    return toast(error.message);
  }

  toast("참고 링크를 삭제했어요.");
  await reloadCloud();
}


$$("dialog").forEach(dialog=>{
  dialog.addEventListener("click",e=>{
    if(e.target===dialog)dialog.close();
  });
});

$("#reservationImageInput").onchange=e=>{
  const file=e.target.files?.[0];
  if(file)handleReservationImage(file);
  e.target.value="";
};
$("#pasteImageArea").addEventListener("paste",e=>{
  const file=[...e.clipboardData.items]
    .find(item=>item.type.startsWith("image/"))?.getAsFile();
  if(!file)return toast("클립보드에 이미지가 없어요.");
  e.preventDefault();
  handleReservationImage(file);
});
$("#removeReservationImageBtn").onclick=()=>{
  $("#reservationImageValue").value="";
  updateReservationImagePreview();
  toast("첨부 사진을 삭제했어요.");
};

$("#leaveRoomBtn").onclick=()=>{localStorage.removeItem("tripRoomCode");location.reload()};

$("#modeText").textContent=cloudEnabled?"실시간 공유 모드":"현재는 이 기기에서만 저장되는 데모 모드입니다. app.js에 Supabase 정보를 넣으면 두 가족이 실시간으로 공유할 수 있어요.";
if(state.roomCode)$("#roomCodeInput").value=state.roomCode;
