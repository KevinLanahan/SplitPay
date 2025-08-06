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
  const userEmail = document.getElementById("user-email").value;
  const userFullName = document.getElementById("user-full-name").value;

  const manualItems = [];
  const runningTotal = document.createElement("p");
  runningTotal.className = "font-semibold text-right text-[#019863] pt-2";
  manualItemsList.insertAdjacentElement("afterend", runningTotal);

  receiptBtn.addEventListener("click", () => {
    uploadForm.classList.remove("hidden");
    manualForm.classList.add("hidden");
    receiptBtn.classList.add("bg-[#019863]", "text-white");
    manualBtn.classList.remove("bg-[#019863]", "text-white");
  });

  manualBtn.addEventListener("click", () => {
    uploadForm.classList.add("hidden");
    manualForm.classList.remove("hidden");
    manualBtn.classList.add("bg-[#019863]", "text-white");
    receiptBtn.classList.remove("bg-[#019863]", "text-white");
  });

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

  addItemBtn?.addEventListener("click", () => {
    const name = itemNameInput.value.trim();
    const price = parseFloat(itemPriceInput.value);
    const owners = Array.from(ownerSelect.selectedOptions).map(o => o.value);
    if (!name || isNaN(price) || price <= 0 || owners.length === 0) {
      alert("Please enter item name, valid price, and at least one owner.");
      return;
    }
    manualItems.push({ name, price, owners });
    const li = document.createElement("li");
    li.className = "flex justify-between items-center bg-white p-2 rounded border text-sm";
    li.innerHTML = `<span><strong>${name}</strong> - $${price.toFixed(2)}</span><span>${owners.join(", ")}</span>`;
    manualItemsList.appendChild(li);
    itemNameInput.value = "";
    itemPriceInput.value = "";
    ownerSelect.selectedIndex = -1;
    updateRunningTotal();
  });

  submitManualBtn?.addEventListener("click", async () => {
    if (manualItems.length === 0) return alert("Please add at least one item.");
    const payload = { paid_by: userEmail, items: manualItems };
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
        renderResults(data.reimbursements, userEmail, userFullName, emailToName);
      }
    } catch (err) {
      console.error("Manual calc error:", err);
      resultsDiv.innerHTML = `<p class="text-red-600 font-semibold">Something went wrong.</p>`;
    }
  });

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
      const { items, user, friends, total_amount } = data;
      receiptItemEntry.classList.remove("hidden");
      receiptItemsList.innerHTML = "";
      resultsDiv.innerHTML = `<p class="font-bold text-right pt-4">Total: $${total_amount.toFixed(2)}</p>`;
      paidBySelect.innerHTML = "";
      const emailToName = {};
      emailToName[user.email] = user.full_name;
      friends.forEach(f => emailToName[f.email] = f.full_name);
      [user, ...friends].forEach(person => {
        const opt = document.createElement("option");
        opt.value = person.email;
        opt.textContent = person.full_name;
        paidBySelect.appendChild(opt);
      });
      items.forEach(item => {
        const itemDiv = document.createElement("li");
        itemDiv.className = "border rounded p-3";
        itemDiv.innerHTML = `<p class="font-semibold">${item.name} - $${item.price.toFixed(2)}</p>`;
        const select = document.createElement("select");
        select.multiple = true;
        select.className = "mt-2 border rounded w-full p-2";
        [user, ...friends].forEach(person => {
          const opt = document.createElement("option");
          opt.value = person.email;
          opt.textContent = person.full_name;
          select.appendChild(opt);
        });
        itemDiv.appendChild(select);
        receiptItemsList.appendChild(itemDiv);
      });

      splitItemsBtn.onclick = async () => {
        const items = [];
        receiptItemsList.querySelectorAll("li").forEach(li => {
          const label = li.querySelector("p").innerText;
          const match = label.match(/^(.*?) - \$(\d+(\.\d{2})?)/);
          if (!match) return;
          const name = match[1].trim();
          const price = parseFloat(match[2]);
          const owners = Array.from(li.querySelector("select").selectedOptions).map(o => o.value);
          if (owners.length > 0) items.push({ name, price, owners });
        });
        if (items.length === 0) return alert("Please assign at least one owner to each item.");
        const paidBy = paidBySelect.value;
        const nameLookup = {};
        document.querySelectorAll("#receipt-paid-by option").forEach(opt => {
          nameLookup[opt.value] = opt.textContent;
        });
        const payload = { paid_by: paidBy, items, name_lookup: nameLookup };
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
      resultsDiv.innerHTML = `<p class="text-red-600 font-semibold">Error uploading receipt.</p>`;
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
  
    const lines = Object.entries(balances).map(([email, balance]) => {
      if (email === paidByEmail) return "";
  
      const name = emailToName[email] || email;
      let status = "";
      let color = "";
  
      if (balance > 0) {
        // They owe the payor
        status = `${name} owes ${paidByName} $${balance.toFixed(2)}`;
        color = "text-green-600";
      } else if (balance < 0) {
        // Payor owes them
        status = `${paidByName} owes ${name} $${Math.abs(balance).toFixed(2)}`;
        color = "text-red-600";
      }
  
      return `<li class="${color}">${status}</li>`;
    }).filter(Boolean).join("");
  
    resultsDiv.innerHTML = `
      <h3 class="text-xl font-bold mt-6">Final Split</h3>
      <ul class="mt-2 space-y-1 text-sm">${lines}</ul>
    `;
  
    // ✅ Save transaction if user is the payor and others owe them
    const totalOwedToUser = Object.entries(balances).reduce((sum, [email, amount]) => {
      return email !== paidByEmail && amount > 0 ? sum + amount : sum;
    }, 0);

    }
  
  
  

  function resetOwnersDropdown() {
    ownerSelect.innerHTML = "";
    const userOption = document.createElement("option");
    userOption.value = userEmail;
    userOption.textContent = "You";
    ownerSelect.appendChild(userOption);
  }

  Array.from(ownerSelect.options).forEach(opt => {
    if (!isNaN(opt.textContent)) opt.remove();
  });
});
