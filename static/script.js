document.addEventListener("DOMContentLoaded", () => {
  const receiptBtn = document.getElementById("receipt-btn");
  const manualBtn = document.getElementById("manual-btn");
  const uploadForm = document.getElementById("photo-form");
  const manualForm = document.getElementById("manual-entry-form");
  const groupSelect = document.getElementById("group-select");
  const uploadGroupSelect = document.getElementById("upload-group-select");
  const resultsDiv = document.getElementById("results");
  const receiptItemEntry = document.getElementById("receipt-item-entry");
  const receiptItemsList = document.getElementById("receipt-items-list");
  const splitItemsBtn = document.getElementById("split-items-btn");
  const paidBySelect = document.getElementById("receipt-paid-by");
  const itemNameInput = document.getElementById("manual-item-name");
  const itemPriceInput = document.getElementById("manual-item-price");
  const ownerSelect = document.getElementById("manual-owners");
  const addItemBtn = document.getElementById("add-manual-item");
  const submitManualBtn = document.getElementById("submit-manual-items");
  const manualItemsList = document.getElementById("manual-items-list");
  const userEmail = document.getElementById("user-email")?.value || "";
  const userFullName = document.getElementById("user-full-name")?.value || "";

  // ---- Manual entry running total ----
  const manualItems = [];
  const runningTotal = document.createElement("p");
  runningTotal.className = "font-semibold text-right text-[#019863] pt-2";
  if (manualItemsList) manualItemsList.insertAdjacentElement("afterend", runningTotal);

  // ---- Toggle Receipt vs Manual ----
  receiptBtn?.addEventListener("click", () => {
    uploadForm?.classList.remove("hidden");
    manualForm?.classList.add("hidden");
    receiptBtn.classList.add("bg-[#019863]", "text-white");
    manualBtn?.classList.remove("bg-[#019863]", "text-white");
  });

  manualBtn?.addEventListener("click", () => {
    uploadForm?.classList.add("hidden");
    manualForm?.classList.remove("hidden");
    manualBtn.classList.add("bg-[#019863]", "text-white");
    receiptBtn?.classList.remove("bg-[#019863]", "text-white");
  });

  // ---- Group -> owners (manual entry) ----
  groupSelect?.addEventListener("change", async (e) => {
    const groupId = e.target.value;
    if (!groupId) return resetOwnersDropdown();
    try {
      const res = await fetch(`/get_group_members/${groupId}`);
      const data = await res.json();
      ownerSelect.innerHTML = "";
      data.forEach((member) => {
        const opt = document.createElement("option");
        opt.value = member.email;
        opt.textContent = member.full_name;
        ownerSelect.appendChild(opt);
      });
    } catch (err) {
      console.error("Failed to fetch group members:", err);
    }
  });

  // ---- Manual: add item ----
  addItemBtn?.addEventListener("click", () => {
    const name = itemNameInput.value.trim();
    const price = parseFloat(itemPriceInput.value);
    const owners = Array.from(ownerSelect.selectedOptions).map((o) => ({
      email: o.value,
      name: o.textContent,
    }));

    if (!name || isNaN(price) || price <= 0 || owners.length === 0) {
      alert("Please enter item name, valid price, and at least one owner.");
      return;
    }

    manualItems.push({ name, price, owners });

    const li = document.createElement("li");
    li.className = "flex justify-between items-center bg-white p-2 rounded border text-sm";
    li.innerHTML = `<span><strong>${name}</strong> - $${price.toFixed(2)}</span><span>${owners.map((o) => o.name).join(", ")}</span>`;
    manualItemsList.appendChild(li);

    itemNameInput.value = "";
    itemPriceInput.value = "";
    ownerSelect.selectedIndex = -1;
    updateRunningTotal();
  });

  // ---- Manual: calculate split ----
  submitManualBtn?.addEventListener("click", async () => {
    if (manualItems.length === 0) return alert("Please add at least one item.");

    const payload = {
      paid_by: userEmail,
      items: manualItems.map((item) => ({
        name: item.name,
        price: item.price,
        owners: item.owners.map((o) => o.email),
      })),
    };

    try {
      const res = await fetch("/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.error) {
        resultsDiv.innerHTML = `<p class="text-red-600 font-semibold">Error: ${data.error}</p>`;
      } else {
        const emailToName = { [userEmail]: userFullName };
        manualItems.forEach((item) => item.owners.forEach((o) => (emailToName[o.email] = o.name)));
        renderResults(data.reimbursements, userEmail, userFullName, emailToName);
      }
    } catch (err) {
      console.error("Manual calc error:", err);
      resultsDiv.innerHTML = `<p class="text-red-600 font-semibold">Something went wrong.</p>`;
    }
  });

  // ---- Receipt upload flow ----
  uploadForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const file = document.getElementById("receipt-upload").files[0];
    const groupId = uploadGroupSelect?.value;
    if (!file) return alert("Please upload a receipt image.");

    const formData = new FormData();
    formData.append("receipt", file);
    if (groupId) formData.append("group_id", groupId);

    try {
      const res = await fetch("/upload_receipt", { method: "POST", body: formData });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const { items, user, friends, total_amount } = data;
      receiptItemEntry.classList.remove("hidden");
      receiptItemsList.innerHTML = "";
      resultsDiv.innerHTML = `<p class="font-bold text-right pt-4">Total: $${Number(total_amount).toFixed(2)}</p>`;

      // Payor dropdown
      paidBySelect.innerHTML = "";
      const emailToName = {};
      emailToName[user.email] = user.full_name;
      friends.forEach((f) => (emailToName[f.email] = f.full_name));
      [user, ...friends].forEach((person) => {
        const opt = document.createElement("option");
        opt.value = person.email;
        opt.textContent = person.full_name;
        paidBySelect.appendChild(opt);
      });

      // Per-item owner multiselects
      items.forEach((item) => {
        const itemLi = document.createElement("li");
        itemLi.className = "border rounded p-3";
        itemLi.innerHTML = `<p class="font-semibold">${item.name} - $${Number(item.price).toFixed(2)}</p>`;
        const select = document.createElement("select");
        select.multiple = true;
        select.className = "mt-2 border rounded w-full p-2";
        [user, ...friends].forEach((person) => {
          const opt = document.createElement("option");
          opt.value = person.email;
          opt.textContent = person.full_name;
          select.appendChild(opt);
        });
        itemLi.appendChild(select);
        receiptItemsList.appendChild(itemLi);
      });

      // Split button behavior
      splitItemsBtn.onclick = async () => {
        const builtItems = [];
        receiptItemsList.querySelectorAll("li").forEach((li) => {
          const label = li.querySelector("p")?.innerText || "";
          const match = label.match(/^(.*?) - \$(\d+(\.\d{2})?)/);
          if (!match) return;

          const name = match[1].trim();
          const price = parseFloat(match[2]);
          const select = li.querySelector("select");
          const owners = Array.from(select.selectedOptions).map((o) => ({
            email: o.value,
            name: o.textContent,
          }));

          if (owners.length > 0) builtItems.push({ name, price, owners });
        });

        if (builtItems.length === 0) return alert("Please assign at least one owner to each item.");

        const paidBy = paidBySelect.value;

        // Name lookup for pretty output
        const nameLookup = {};
        document.querySelectorAll("#receipt-paid-by option").forEach((opt) => (nameLookup[opt.value] = opt.textContent));

        const payload = {
          paid_by: paidBy,
          items: builtItems.map((item) => ({
            name: item.name,
            price: item.price,
            owners: item.owners.map((o) => o.email),
          })),
        };

        try {
          const res = await fetch("/calculate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const data = await res.json();
          if (data.error) {
            resultsDiv.innerHTML = `<p class="text-red-600 font-semibold">Error: ${data.error}</p>`;
          } else {
            renderResults(data.reimbursements, paidBy, nameLookup[paidBy] || paidBy, nameLookup);
          }
        } catch (err) {
          console.error("Split calc error:", err);
          resultsDiv.innerHTML = `<p class="text-red-600 font-semibold">Something went wrong.</p>`;
        }
      };
    } catch (err) {
      console.error("Upload error:", err);
      resultsDiv.innerHTML = `<p class="text-red-600 font-semibold">Error uploading receipt: ${err.message || ""}</p>`;
    }
  });

  itemPriceInput?.addEventListener("input", updateRunningTotal);

  function updateRunningTotal() {
    const current = parseFloat(itemPriceInput.value);
    const sum = manualItems.reduce((total, item) => total + item.price, 0);
    const liveTotal = isNaN(current) ? sum : sum + current;
    runningTotal.textContent = `Running Total: $${liveTotal.toFixed(2)}`;
  }

  function renderResults(balances, paidByEmail, paidByName, emailToName) {
    if (!balances || typeof balances !== "object") {
      resultsDiv.innerHTML = `<p class="text-red-600 font-semibold">Invalid response: balances is missing or not an object.</p>`;
      console.error("Invalid balances object:", balances);
      return;
    }

    const lines = Object.entries(balances)
      .map(([email, balance]) => {
        if (email === paidByEmail) return "";
        const name = emailToName[email] || email;
        if (balance > 0) return `<li class="text-green-600">${name} owes ${paidByName} $${balance.toFixed(2)}</li>`;
        if (balance < 0) return `<li class="text-red-600">${paidByName} owes ${name} $${Math.abs(balance).toFixed(2)}</li>`;
        return "";
      })
      .filter(Boolean)
      .join("");

    resultsDiv.innerHTML = `
      <h3 class="text-xl font-bold mt-6">Final Split</h3>
      <ul class="mt-2 space-y-1 text-sm">${lines}</ul>
    `;
  }

  function resetOwnersDropdown() {
    ownerSelect.innerHTML = "";
    const userOption = document.createElement("option");
    userOption.value = userEmail;
    userOption.textContent = "You";
    ownerSelect.appendChild(userOption);
  }

  // Clean any numeric-only options accidentally present
  Array.from(ownerSelect?.options || []).forEach((opt) => {
    if (!isNaN(opt.textContent)) opt.remove();
  });

  // ---- Sidebar groups ----
  document.querySelectorAll(".group-btn").forEach((li) => {
    attachGroupClickListener(li);
  });

  // ---- Create group ----
  document.getElementById("create-group-btn")?.addEventListener("click", async () => {
    const groupName = prompt("Enter group name:");
    if (!groupName) return;

    try {
      const res = await fetch("/create_group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: groupName }),
      });
      const data = await res.json();

      if (data.success) {
        const newLi = document.createElement("li");
        newLi.className = "group-btn text-[#0c1c17] hover:underline cursor-pointer";
        newLi.dataset.groupId = data.group_id;
        newLi.textContent = `${groupName} (1 member)`;
        document.querySelector("#group-panel")?.classList.add("hidden");
        document.querySelector(".group-btn")?.parentElement.appendChild(newLi);
        attachGroupClickListener(newLi);
        alert("Group created!");
      } else {
        alert(data.message || "Something went wrong.");
      }
    } catch (err) {
      console.error("Create group error:", err);
      alert("Failed to create group.");
    }
  });

  // ===========================
  //   Notifications dropdown
  // ===========================
  (() => {
    const btn = document.getElementById("notif-btn");
    const panel = document.getElementById("notif-panel");
    const listEl = document.getElementById("notif-list");
    const badge = document.getElementById("notif-badge");
    const markRead = document.getElementById("notif-mark-read");

    if (!btn || !panel || !listEl || !badge || !markRead) return;

    const fmtAgo = (iso) => {
      try {
        const d = new Date(iso);
        const s = Math.max(1, Math.floor((Date.now() - d.getTime()) / 1000));
        if (s < 60) return `${s}s ago`;
        const m = Math.floor(s / 60);
        if (m < 60) return `${m}m ago`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${h}h ago`;
        const dd = Math.floor(h / 24);
        return `${dd}d ago`;
      } catch {
        return "";
      }
    };

    const svgCheck = `
      <svg class="w-4 h-4 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
      </svg>`;
    const svgX = `
      <svg class="w-4 h-4 text-red-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
      </svg>`;

    const defaultPic = "/static/profile_pics/default.png";
    const avatar = (src) =>
      `<img src="${src && src.trim() ? src : defaultPic}" class="w-6 h-6 rounded-full object-cover" alt="user">`;

    const setBadge = (n) => {
      if (!n || n <= 0) {
        badge.classList.add("hidden");
        badge.textContent = "";
      } else {
        badge.classList.remove("hidden");
        badge.textContent = n > 99 ? "99+" : String(n);
      }
    };

    async function refreshCount() {
      try {
        const r = await fetch("/notifications/count");
        if (!r.ok) throw 0;
        const { count } = await r.json();
        setBadge(count || 0);
      } catch {
        setBadge(0);
      }
    }

    function renderItem(it) {
      if (it.type === "friend_request") {
        return `
          <div class="notif-item flex items-center justify-between px-4 py-2" data-kind="friend" data-id="${it.id}">
            <div class="flex items-center gap-2 min-w-0">
              ${avatar(it.sender_pic)}
              <div class="min-w-0">
                <p class="text-sm text-[#0c1c17] truncate"><span class="font-medium">${it.sender_name || "Someone"}</span> sent you a friend request</p>
                <p class="text-[11px] text-gray-500">
                  <time class="notif-time" datetime="${it.created_at}">${fmtAgo(it.created_at)}</time>
                </p>
              </div>
            </div>
            <div class="flex gap-1 shrink-0">
              <button class="act-accept p-1 rounded bg-green-100 hover:bg-green-200" title="Accept">${svgCheck}</button>
              <button class="act-decline p-1 rounded bg-red-100 hover:bg-red-200" title="Decline">${svgX}</button>
            </div>
          </div>`;
      }
    
      if (it.type === "group_invite") {
        return `
          <div class="notif-item flex items-center justify-between px-4 py-2" data-kind="ginvite" data-id="${it.invite_id}">
            <div class="flex items-center gap-2 min-w-0">
              ${avatar(it.inviter_pic)}
              <div class="min-w-0">
                <p class="text-sm text-[#0c1c17] truncate">
                  <span class="font-medium">${it.inviter_name || "Someone"}</span> invited you to
                  <span class="font-medium">${it.group_name || "a group"}</span>
                </p>
                <p class="text-[11px] text-gray-500">
                  <time class="notif-time" datetime="${it.created_at}">${fmtAgo(it.created_at)}</time>
                </p>
              </div>
            </div>
            <div class="flex gap-1 shrink-0">
              <button class="act-accept p-1 rounded bg-green-100 hover:bg-green-200" title="Accept">${svgCheck}</button>
              <button class="act-decline p-1 rounded bg-red-100 hover:bg-red-200" title="Decline">${svgX}</button>
            </div>
          </div>`;
      }
    
      return `
        <div class="px-4 py-3">
          <p class="text-sm text-[#0c1c17]">New notification</p>
          ${it.created_at ? `
            <p class="text-[11px] text-gray-500">
              <time class="notif-time" datetime="${it.created_at}">${fmtAgo(it.created_at)}</time>
            </p>` : ""}
        </div>`;
    }
    

    let __notifTicker = null; 

async function loadList() {
  listEl.innerHTML = `<div class="px-4 py-6 text-sm text-gray-500">Loading…</div>`;
  try {
    const r = await fetch("/notifications/list");
    if (!r.ok) throw 0;

    const items = await r.json();
    if (!Array.isArray(items) || items.length === 0) {
      listEl.innerHTML = `<div class="px-4 py-6 text-sm text-gray-500">No new notifications</div>`;
      if (__notifTicker) { clearInterval(__notifTicker); __notifTicker = null; }
      return;
    }

    listEl.innerHTML = items.map(renderItem).join("");

    const tick = () => {
      listEl.querySelectorAll(".notif-time").forEach(t => {
        const iso = t.getAttribute("datetime");
        if (iso) t.textContent = fmtAgo(iso);
      });
    };
    tick(); 
    if (__notifTicker) clearInterval(__notifTicker);
    __notifTicker = setInterval(tick, 30_000); 

  } catch {
    listEl.innerHTML = `<div class="px-4 py-6 text-sm text-red-600">Failed to load notifications.</div>`;
    if (__notifTicker) { clearInterval(__notifTicker); __notifTicker = null; }
  }
}

    

    async function post(url, body, { asJson = false, asForm = false } = {}) {
      const init = { method: "POST" };
      if (asJson) {
        init.headers = { "Content-Type": "application/json" };
        init.body = JSON.stringify(body || {});
      } else if (asForm) {
        const fd = new URLSearchParams();
        for (const k in (body || {})) fd.append(k, body[k]);
        init.headers = { "Content-Type": "application/x-www-form-urlencoded" };
        init.body = fd.toString();
      }
      const r = await fetch(url, init);
      return r.ok;
    }

    listEl.addEventListener("click", async (e) => {
      const item = e.target.closest(".notif-item");
      if (!item) return;

      const kind = item.getAttribute("data-kind");
      const id = item.getAttribute("data-id");
      const isAccept = !!e.target.closest(".act-accept");
      const isDecline = !!e.target.closest(".act-decline");

      if (kind === "friend") {
        if (isAccept) {
          const ok = await post(`/accept_request/${id}`, null);
          if (ok) {
            item.remove();
            refreshCount();
          }
        } else if (isDecline) {
          window.location.href = "/friends";
        }
        return;
      }

      if (kind === "ginvite") {
        if (isAccept) {
          const ok = await post("/accept_group_invite", { invite_id: id }, { asJson: true });
          if (ok) {
            item.remove();
            refreshCount();
          }
        } else if (isDecline) {
          const ok = await post("/decline_invite", { invite_id: id }, { asForm: true });
          if (ok) {
            item.remove();
            refreshCount();
          }
        }
      }
    });

    markRead.addEventListener("click", async () => {
      try {
        await fetch("/notifications/mark-read", { method: "POST" });
        panel.classList.add("hidden");
        refreshCount();
      } catch {}
    });

    btn.addEventListener("click", async () => {
      const opening = panel.classList.contains("hidden");
      document.querySelectorAll("#notif-panel").forEach((p) => p !== panel && p.classList.add("hidden"));
      panel.classList.toggle("hidden");
      if (opening) await loadList();
    });

    document.addEventListener("click", (e) => {
      if (!panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
        panel.classList.add("hidden");
      }
    });

    refreshCount();
    setInterval(refreshCount, 30000);
  })();

  // ===========================
  //   Transaction time → local
  // ===========================
  (function formatTransactionTimes() {
    const fmtOptions = {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    };
    document.querySelectorAll(".transaction-time").forEach((el) => {
      let iso = el.getAttribute("datetime") || el.textContent || "";
      iso = iso.trim();
      if (iso && !/[zZ]|[+\-]\d{2}:?\d{2}$/.test(iso)) {
        iso += "Z"; // treat as UTC if no tz info
      }
      const d = new Date(iso);
      if (!isNaN(d.getTime())) {
        el.textContent = d.toLocaleString(undefined, fmtOptions);
      }
    });
  })();
}); // END DOMContentLoaded

// ===========================
//   Sidebar group helpers
// ===========================
function attachGroupClickListener(li) {
  li.addEventListener("click", async () => {
    const groupId = li.dataset.groupId;

    try {
      const res = await fetch(`/group/${groupId}`);
      const data = await res.json();

      const panel = document.getElementById("group-panel");
      panel.innerHTML = `
        <h3 class="text-lg font-bold mb-2">${data.name}</h3>
        <ul class="mb-4 space-y-1">
          ${data.members.map((m) => `<li class="text-sm">${m.full_name}</li>`).join("")}
        </ul>
        <div class="flex gap-2">
          <button id="invite-btn" class="bg-[#019863] text-white px-3 py-1 rounded text-sm">Invite Someone</button>
          <button id="leave-group-btn" class="bg-red-600 text-white px-3 py-1 rounded text-sm">Leave Group</button>
        </div>
      `;
      panel.classList.remove("hidden");

      document.getElementById("invite-btn").addEventListener("click", () => {
        const invitee = prompt("Enter the username to invite:");
        if (!invitee) return;
        fetch("/invite_to_group", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ group: data.name, invitee }),
        })
          .then((r) => r.json())
          .then((d) => alert(d.message || "Invite sent!"))
          .catch((err) => {
            console.error("Error sending invite:", err);
            alert("Failed to send invite.");
          });
      });

      document.getElementById("leave-group-btn").addEventListener("click", () => {
        if (!confirm("Are you sure you want to leave this group?")) return;
        fetch("/leave_group", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ group_id: groupId }),
        })
          .then((r) => r.json())
          .then((d) => {
            alert(d.message || "Left group.");
            panel.classList.add("hidden");
            li.remove();
          })
          .catch((err) => {
            console.error("Error leaving group:", err);
            alert("Failed to leave group.");
          });
      });
    } catch (err) {
      console.error("Error loading group:", err);
    }
  });
}

// ===========================
//   Toast + billing helpers
// ===========================
const toast = (msg, type = "info") => {
  const root = document.getElementById("toast-root");
  if (!root) return alert(msg);
  const el = document.createElement("div");
  el.className =
    "rounded-lg px-4 py-3 shadow border text-sm transition-all duration-300 " +
    (type === "error"
      ? "bg-red-50 border-red-200 text-red-800"
      : type === "success"
      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
      : "bg-white border-gray-200 text-gray-800");
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(-6px)";
  }, 2800);
  setTimeout(() => el.remove(), 3400);
};

const postJSON = async (url, body) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  let data = null;
  try {
    data = await res.json();
  } catch (_) {}
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
};

document.querySelectorAll(".select-plan").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const plan = btn.dataset.plan; // 'free' | 'pro' | 'pro_plus'
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Loading...";

    try {
      if (plan === "free") {
        const r = await postJSON("/set-plan", { plan: "free" });
        if (r.ok) {
          toast("Switched to Free.", "success");
          setTimeout(() => location.reload(), 700);
        }
        return;
      }

      const data = await postJSON("/create-checkout-session", { plan });
      if (data.url) {
        window.location = data.url;
      } else {
        throw new Error("No checkout URL returned.");
      }
    } catch (err) {
      toast(err.message || "Something went wrong.", "error");
      btn.disabled = false;
      btn.textContent = original;
    }
  });
});

