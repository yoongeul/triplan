const SUPABASE_URL = "https://kgwgyxbkyddlmhezxiwn.supabase.co/";
const SUPABASE_ANON_KEY = "sb_publishable_CPjg5G9P9_j9omT4LxH7DQ_S-FKlArB";

const cloudEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
const db = cloudEnabled ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const state = {
  roomCode: localStorage.getItem("tripRoomCode") || "",
  trip: null,
  categories: [],
  participants: [],
  items: [],
  selectedCategory: "전체",
  selectedSection: "plan",
  channel: null
};

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

async function reloadCloud(){
  const [{data:cats,error:catErr},{data:participants,error:partErr},{data:items,error:itemErr}]=await Promise.all([
    db.from("trip_categories").select("*").eq("room_code",state.roomCode).order("sort_order"),
    db.from("trip_participants").select("*").eq("room_code",state.roomCode).order("sort_order"),
    db.from("trip_items").select("*").eq("room_code",state.roomCode).order("created_at")
  ]);
  if(catErr||partErr||itemErr)return toast((catErr||partErr||itemErr).message);
  state.categories=cats||[]; state.participants=participants||[]; state.items=items||[]; render();
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
  $$(".main-tab").forEach(btn=>{
    btn.classList.toggle("active",btn.dataset.section===state.selectedSection);
    btn.onclick=()=>{
      state.selectedSection=btn.dataset.section;
      state.selectedCategory="전체";
      render();
    };
  });
}
function renderCategories(){
  const names=["전체",...state.categories.map(c=>c.name)];
  if(!names.includes(state.selectedCategory))state.selectedCategory="전체";
  $("#categoryTabs").innerHTML=names.map(name=>`<button class="category-tab ${name===state.selectedCategory?"active":""}" data-category="${esc(name)}">${esc(name)}</button>`).join("");
  $("#categoryTabs").querySelectorAll("button").forEach(btn=>btn.onclick=()=>{state.selectedCategory=btn.dataset.category;render()});
  $("#itemCategoryInput").innerHTML=state.categories.map(c=>`<option value="${esc(c.name)}">${esc(c.name)}</option>`).join("");
  $("#categoryManageList").innerHTML=state.categories.length?state.categories.map(c=>`
    <div class="category-row" data-category-row="${c.id}">
      <strong class="category-display-name">${esc(c.name)}</strong>
      <div>
        <button type="button" class="edit-category" data-edit-category="${c.id}" data-name="${esc(c.name)}">수정</button>
        <button type="button" class="delete-category" data-id="${c.id}" data-name="${esc(c.name)}">삭제</button>
      </div>
    </div>`).join(""):`<div class="empty">카테고리가 없습니다.</div>`;
  $("#categoryManageList").querySelectorAll(".edit-category").forEach(btn=>btn.onclick=()=>startCategoryEdit(btn.dataset.editCategory,btn.dataset.name));
  $("#categoryManageList").querySelectorAll(".delete-category").forEach(btn=>btn.onclick=()=>deleteCategory(btn.dataset.id,btn.dataset.name));
}
function renderItems(){
  const sectionItems=state.items.filter(i=>(i.section_type||"plan")===state.selectedSection);
  const shown=sectionItems.filter(i=>state.selectedCategory==="전체"||i.category_name===state.selectedCategory);
  const baseTitle=state.selectedSection==="plan"?"여행 계획":"여행 일정";
  $("#listTitle").textContent=state.selectedCategory==="전체"?baseTitle:`${baseTitle} · ${state.selectedCategory}`;
  const done=sectionItems.filter(i=>i.done).length,total=sectionItems.length;
  $("#progressText").textContent=`${done} / ${total}`;
  $("#progressBar").style.width=`${total?Math.round(done/total*100):0}%`;

  $("#checklist").innerHTML=shown.length?shown.map(item=>{
    const reservation=item.reservation_required?`
      <div class="reservation-box">
        <strong>${item.reservation_done?"예약 완료":"예약 필요"}</strong>
        ${item.reservation_date||item.reservation_time?`<div>${esc(item.reservation_date||"")} ${esc(item.reservation_time||"")}</div>`:""}
        ${item.reservation_place?`<div>예약처: ${esc(item.reservation_place)}</div>`:""}
        ${item.reservation_number?`<div>예약번호: ${esc(item.reservation_number)}</div>`:""}
        ${item.reservation_note?`<div>${esc(item.reservation_note)}</div>`:""}
        ${item.reservation_image_url?`<a class="reservation-image-link" href="${esc(item.reservation_image_url)}" target="_blank" rel="noopener"><img src="${esc(item.reservation_image_url)}" alt="예약 첨부 이미지"></a>`:""}
      </div>`:"";
    const scheduleInfo=(item.section_type||"plan")==="schedule"?`
      <div class="schedule-date">${esc(item.schedule_date||"날짜 미정")} ${esc(item.schedule_time||"")}</div>
      ${item.schedule_place?`<div class="item-note">📍 ${esc(item.schedule_place)}</div>`:""}`:"";
    return `<article class="item-card ${(item.section_type||"plan")==="schedule"?"schedule-item":""} ${item.done?"done":""}">
      <button class="check-btn ${item.done?"checked":""}" data-check="${item.id}">${item.done?"✓":""}</button>
      <div class="item-main">
        ${scheduleInfo}
        <div class="item-title">${esc(item.title)}</div>
        ${item.note?`<p class="item-note">${esc(item.note)}</p>`:""}
        <div class="meta">
          <span class="badge category">${esc(item.category_name)}</span>
          ${item.owner?`<span class="badge owner">${esc(ownerName(item.owner))}</span>`:""}
          ${item.reservation_required?`<span class="badge reserve ${item.reservation_done?"done":""}">${item.reservation_done?"예약 완료":"예약 필요"}</span>`:""}
        </div>
        ${reservation}
      </div>
      <div class="actions">
        <button class="mini-btn" data-edit="${item.id}" aria-label="수정">✏️</button>
        <button class="mini-btn" data-delete="${item.id}" aria-label="삭제">🗑️</button>
      </div>
    </article>`;
  }).join(""):`<div class="empty">등록된 항목이 없습니다.<br>새 항목을 추가해 보세요.</div>`;

  $$("[data-check]").forEach(b=>b.onclick=()=>toggleItem(b.dataset.check));
  $$("[data-edit]").forEach(b=>b.onclick=()=>openItemDialog(b.dataset.edit));
  $$("[data-delete]").forEach(b=>b.onclick=()=>deleteItem(b.dataset.delete));
}
function openItemDialog(id=""){
  $("#itemForm").reset(); $("#editingItemId").value=id;
  const item=state.items.find(i=>i.id===id);
  $("#itemDialogTitle").textContent=item?"항목 수정":"항목 추가";
  $("#itemSectionInput").value=item?.section_type||state.selectedSection;
  $("#itemOwnerInput").innerHTML=`<option value="">담당자 없음</option>`+
    state.participants.map(p=>`<option value="${esc(p.name)}">${esc(p.name)}</option>`).join("");
  if(item){
    $("#itemTitleInput").value=item.title||"";
    $("#scheduleDateInput").value=item.schedule_date||"";
    $("#scheduleTimeInput").value=item.schedule_time||"";
    $("#schedulePlaceInput").value=item.schedule_place||"";
    $("#itemCategoryInput").value=item.category_name||state.categories[0]?.name||"";
    $("#itemOwnerInput").value=item.owner||"공동";
    $("#itemNoteInput").value=item.note||"";
    $("#reservationRequiredInput").checked=!!item.reservation_required;
    $("#reservationDoneInput").checked=!!item.reservation_done;
    $("#reservationDateInput").value=item.reservation_date||"";
    $("#reservationTimeInput").value=item.reservation_time||"";
    $("#reservationPlaceInput").value=item.reservation_place||"";
    $("#reservationNumberInput").value=item.reservation_number||"";
    $("#reservationNoteInput").value=item.reservation_note||"";
    $("#reservationImageValue").value=item.reservation_image_url||"";
  }
  if(!item)$("#reservationImageValue").value="";
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

async function saveItem(e){
  e.preventDefault();
  const id=$("#editingItemId").value;
  const reservationRequired=$("#reservationRequiredInput").checked;
  const sectionType=$("#itemSectionInput").value;
  const payload={
    room_code:state.roomCode,
    section_type:sectionType,
    schedule_date:sectionType==="schedule"?($("#scheduleDateInput").value||null):null,
    schedule_time:sectionType==="schedule"?($("#scheduleTimeInput").value||null):null,
    schedule_place:sectionType==="schedule"?$("#schedulePlaceInput").value.trim():"",
    title:$("#itemTitleInput").value.trim(),
    category_name:$("#itemCategoryInput").value,
    owner:$("#itemOwnerInput").value || "",
    note:$("#itemNoteInput").value.trim(),
    reservation_required:reservationRequired,
    reservation_done:reservationRequired&&$("#reservationDoneInput").checked,
    reservation_date:reservationRequired?($("#reservationDateInput").value||null):null,
    reservation_time:reservationRequired?($("#reservationTimeInput").value||null):null,
    reservation_place:reservationRequired?$("#reservationPlaceInput").value.trim():"",
    reservation_number:reservationRequired?$("#reservationNumberInput").value.trim():"",
    reservation_note:reservationRequired?$("#reservationNoteInput").value.trim():"",
    reservation_image_url:reservationRequired?$("#reservationImageValue").value:""
  };
  if(!payload.title)return toast("준비 항목을 입력해 주세요.");

  if(!cloudEnabled){
    if(id){
      const idx=state.items.findIndex(i=>i.id===id);
      state.items[idx]={...state.items[idx],...payload};
    }else state.items.push({id:uid(),done:false,...payload});
    persistLocal(); render();
  }else{
    const q=id?db.from("trip_items").update(payload).eq("id",id):db.from("trip_items").insert(payload);
    const {error}=await q;if(error)return toast(error.message);await reloadCloud();
  }
  $("#itemDialog").close(); toast(id?"수정했어요.":"추가했어요.");
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
async function addCategory(e){
  e.preventDefault();
  const name=$("#newCategoryInput").value.trim();
  if(!name)return toast("카테고리 이름을 입력해 주세요.");
  if(state.categories.some(c=>c.name===name))return toast("이미 있는 카테고리예요.");
  const payload={room_code:state.roomCode,name,sort_order:state.categories.length};
  if(!cloudEnabled){state.categories.push({id:uid(),...payload});persistLocal();render()}
  else{const {error}=await db.from("trip_categories").insert(payload);if(error)return toast(error.message);await reloadCloud()}
  $("#newCategoryInput").value="";toast("카테고리를 추가했어요.");
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
    state.items.forEach(item=>{if(item.category_name===oldName)item.category_name=newName});
    if(state.selectedCategory===oldName)state.selectedCategory=newName;
    persistLocal();render();
  }else{
    const {error:itemError}=await db.from("trip_items").update({category_name:newName})
      .eq("room_code",state.roomCode).eq("category_name",oldName);
    if(itemError)return toast(itemError.message);
    const {error:categoryError}=await db.from("trip_categories").update({name:newName}).eq("id",id);
    if(categoryError)return toast(categoryError.message);
    if(state.selectedCategory===oldName)state.selectedCategory=newName;
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

function renderParticipants(){
  const ownerSelect=$("#itemOwnerInput");
  if(ownerSelect){
    const current=ownerSelect.value;
    ownerSelect.innerHTML=`<option value="">담당자 없음</option>`+
      state.participants.map(p=>`<option value="${esc(p.name)}">${esc(p.name)}</option>`).join("");
    ownerSelect.value=current;
  }
  const list=$("#participantManageList");
  if(!list)return;
  list.innerHTML=state.participants.length?state.participants.map(p=>`
    <div class="category-row">
      <strong>${esc(p.name)}</strong>
      <button type="button" class="delete-category" data-participant-id="${p.id}" data-participant-name="${esc(p.name)}">삭제</button>
    </div>`).join(""):`<div class="empty">등록된 참여자가 없습니다.</div>`;
  list.querySelectorAll("[data-participant-id]").forEach(btn=>{
    btn.onclick=()=>deleteParticipant(btn.dataset.participantId,btn.dataset.participantName);
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

$("#joinBtn").onclick=openRoom;
$("#roomCodeInput").addEventListener("keydown",e=>{if(e.key==="Enter")openRoom()});
$("#addItemBtn").onclick=()=>openItemDialog();
$("#manageCategoriesBtn").onclick=()=>$("#categoryDialog").showModal();
$("#openSettingsBtn").onclick=()=>state.trip?$("#settingsDialog").showModal():toast("먼저 여행방에 들어가 주세요.");
$("#itemSectionInput").onchange=updateItemSectionFields;
$("#reservationRequiredInput").onchange=updateReservationFields;
$("#itemForm").onsubmit=saveItem;
$("#categoryForm").onsubmit=addCategory;
$("#settingsForm").onsubmit=saveSettings;
$("#saveTripInfoBtn").onclick=saveTripInfo;
$("#addParticipantBtn").onclick=addParticipant;
function closeDialogFromButton(button){
  const dialog=button.closest("dialog");
  if(dialog?.open)dialog.close();
}
document.addEventListener("click",e=>{
  const closeButton=e.target.closest("[data-close-dialog],.close-dialog");
  if(closeButton){
    e.preventDefault();
    e.stopPropagation();
    closeDialogFromButton(closeButton);
  }
});
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
