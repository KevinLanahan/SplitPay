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

  const manualItems = [];
  const runningTotal = document.createElement("p");
  runningTotal.className = "font-semibold text-right text-[#019863] pt-2";
  if (manualItemsList) manualItemsList.insertAdjacentElement("afterend", runningTotal);

  // Toggle Receipt vs Manual
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

  // Group -> owners (manual entry)
  groupSelect?.addEventListener("change", async (e) => {
    const groupId = e.target.value;
    if (!groupId) return resetOwnersDropdown();
    try {
      const res = await fetch(`/get_group_members/${groupId}`);
      const data = await res.json();
      ownerSelect.innerHTML = "";
      data.forEach(member => {
        const opt = document.createElement("option");
        opt.value = member.email;
        opt.textContent = member.full_name;
        ownerSelect.appendChild(opt);
      });
    } catch (err) {
      console.error("Failed to fetch group members:", err);
    }
  });

  // Manual add item
  addItemBtn?.addEventListener("click", () => {
    const name = itemNameInput.value.trim();
    const price = parseFloat(itemPriceInput.value);

    const owners = Array.from(ownerSelect.selectedOptions).map(o => ({
      email: o.value,
      name: o.textContent
    }));

    if (!name || isNaN(price) || price <= 0 || owners.length === 0) {
      alert("Please enter item name, valid price, and at least one owner.");
      return;
    }

    manualItems.push({ name, price, owners });

    const li = document.createElement("li");
    li.className = "flex justify-between items-center bg-white p-2 rounded border text-sm";
    li.innerHTML = `<span><strong>${name}</strong> - $${price.toFixed(2)}</span><span>${owners.map(o => o.name).join(", ")}</span>`;
    manualItemsList.appendChild(li);

    itemNameInput.value = "";
    itemPriceInput.value = "";
    ownerSelect.selectedIndex = -1;
    updateRunningTotal();
  });

  // Manual calculate
  submitManualBtn?.addEventListener("click", async () => {
    if (manualItems.length === 0) return alert("Please add at least one item.");

    const payload = {
      paid_by: userEmail,
      items: manualItems.map(item => ({
        name: item.name,
        price: item.price,
        owners: item.owners.map(o => o.email)
      }))
    };

    try {
      const res = await fetch("/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.error) {
        resultsDiv.innerHTML = `<p class="text-red-600 font-semibold">Error: ${data.error}</p>`;
      } else {
        const emailToName = { [userEmail]: userFullName };
        manualItems.forEach(item => item.owners.forEach(o => (emailToName[o.email] = o.name)));
        renderResults(data.reimbursements, userEmail, userFullName, emailToName);
      }
    } catch (err) {
      console.error("Manual calc error:", err);
      resultsDiv.innerHTML = `<p class="text-red-600 font-semibold">Something went wrong.</p>`;
    }
  });

  // Receipt upload flow
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

      // Populate payor dropdown
      paidBySelect.innerHTML = "";
      const emailToName = {};
      emailToName[user.email] = user.full_name;
      friends.forEach(f => (emailToName[f.email] = f.full_name));
      [user, ...friends].forEach(person => {
        const opt = document.createElement("option");
        opt.value = person.email;
        opt.textContent = person.full_name;
        paidBySelect.appendChild(opt);
      });

      // Build per-item owner multiselects
      items.forEach(item => {
        const itemLi = document.createElement("li");
        itemLi.className = "border rounded p-3";
        itemLi.innerHTML = `<p class="font-semibold">${item.name} - $${Number(item.price).toFixed(2)}</p>`;
        const select = document.createElement("select");
        select.multiple = true;
        select.className = "mt-2 border rounded w-full p-2";
        [user, ...friends].forEach(person => {
          const opt = document.createElement("option");
          opt.value = person.email;
          opt.textContent = person.full_name;
          select.appendChild(opt);
        });
        itemLi.appendChild(select);
        receiptItemsList.appendChild(itemLi);
      });

      // Split button
      splitItemsBtn.onclick = async () => {
        const builtItems = [];
        receiptItemsList.querySelectorAll("li").forEach(li => {
          const label = li.querySelector("p")?.innerText || "";
          const match = label.match(/^(.*?) - \$(\d+(\.\d{2})?)/);
          if (!match) return;

          const name = match[1].trim();
          const price = parseFloat(match[2]);
          const select = li.querySelector("select");
          const owners = Array.from(select.selectedOptions).map(o => ({
            email: o.value,
            name: o.textContent
          }));

          if (owners.length > 0) builtItems.push({ name, price, owners });
        });

        if (builtItems.length === 0) return alert("Please assign at least one owner to each item.");

        const paidBy = paidBySelect.value;

        // Build name lookup for pretty output
        const nameLookup = {};
        document.querySelectorAll("#receipt-paid-by option").forEach(opt => (nameLookup[opt.value] = opt.textContent));

        // Payload now uses the receipt 'builtItems' + the selected paidBy
        const payload = {
          paid_by: paidBy,
          items: builtItems.map(item => ({
            name: item.name,
            price: item.price,
            owners: item.owners.map(o => o.email)
          }))
        };

        try {
          const res = await fetch("/calculate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
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

  // Clean up any numeric-only options accidentally present
  Array.from(ownerSelect?.options || []).forEach(opt => {
    if (!isNaN(opt.textContent)) opt.remove();
  });

  // Sidebar groups
  document.querySelectorAll(".group-btn").forEach(li => {
    attachGroupClickListener(li);
  });

  // Create group
  document.getElementById("create-group-btn")?.addEventListener("click", async () => {
    const groupName = prompt("Enter group name:");
    if (!groupName) return;

    try {
      const res = await fetch("/create_group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: groupName })
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
});

// Attach listener for a sidebar group item
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
          ${data.members.map(m => `<li class="text-sm">${m.full_name}</li>`).join("")}
        </ul>
        <div class="flex gap-2">
          <button id="invite-btn" class="bg-[#019863] text-white px-3 py-1 rounded text-sm">Invite Someone</button>
          <button id="leave-group-btn" class="bg-red-600 text-white px-3 py-1 rounded text-sm">Leave Group</button>
        </div>
      `;
      panel.classList.remove("hidden");

      // Invite flow — matches Flask: { group: <name>, invitee: <username> }
      document.getElementById("invite-btn").addEventListener("click", () => {
        const invitee = prompt("Enter the username to invite:");
        if (!invitee) return;
        fetch("/invite_to_group", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ group: data.name, invitee })
        })
          .then(r => r.json())
          .then(d => alert(d.message || "Invite sent!"))
          .catch(err => {
            console.error("Error sending invite:", err);
            alert("Failed to send invite.");
          });
      });

      // Leave group
      document.getElementById("leave-group-btn").addEventListener("click", () => {
        if (!confirm("Are you sure you want to leave this group?")) return;
        fetch("/leave_group", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ group_id: groupId })
        })
          .then(r => r.json())
          .then(d => {
            alert(d.message || "Left group.");
            panel.classList.add("hidden");
            li.remove();
          })
          .catch(err => {
            console.error("Error leaving group:", err);
            alert("Failed to leave group.");
          });
      });
    } catch (err) {
      console.error("Error loading group:", err);
    }
  });
}

/* ---------- Toast + helpers used by billing ---------- */

// Toast notification helper
const toast = (msg, type = "info") => {
  const root = document.getElementById("toast-root");
  if (!root) return alert(msg); // fallback if container missing
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
  setTimeout(() => { el.style.opacity = "0"; el.style.transform = "translateY(-6px)"; }, 2800);
  setTimeout(() => el.remove(), 3400);
};

// POST JSON helper
const postJSON = async (url, body) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {})
  });
  let data = null;
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
};

// Billing plan selection (works anywhere the buttons exist)
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
        window.location = data.url; // Stripe Checkout
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
