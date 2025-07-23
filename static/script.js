document.addEventListener("DOMContentLoaded", function () {
  // ===== Manual Tab Logic =====
  const manualContainer = document.getElementById("manual-items");
  const addBtn = document.getElementById("add-manual-item");
  const totalEl = document.getElementById("manual-total");
  const payerSelect = document.getElementById("manual-payer");

  let people = [];
  if (window.manualUser && window.manualFriends) {
    people = [window.manualUser, ...window.manualFriends.filter(name => name !== window.manualUser)];
    people.forEach(name => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      payerSelect.appendChild(opt);
    });
  }

  function updateTotal() {
    const priceInputs = manualContainer.querySelectorAll(".price-input");
    let total = 0;
    priceInputs.forEach(input => {
      const val = parseFloat(input.value);
      if (!isNaN(val)) total += val;
    });
    totalEl.textContent = `Total: $${total.toFixed(2)}`;
  }

  function createItem(name = "", price = "", owners = []) {
    const div = document.createElement("div");
    div.classList.add("ocr-item");

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.placeholder = "Item name";
    nameInput.value = name;
    nameInput.classList.add("item-name");

    const priceInput = document.createElement("input");
    priceInput.type = "number";
    priceInput.step = "0.01";
    priceInput.placeholder = "Price";
    priceInput.value = price;
    priceInput.classList.add("price-input");
    priceInput.addEventListener("input", updateTotal);

    const select = document.createElement("select");
    select.classList.add("owner-select");
    select.setAttribute("multiple", "");

    people.forEach(person => {
      const option = document.createElement("option");
      option.value = person;
      option.textContent = person;
      select.appendChild(option);
    });

    div.appendChild(nameInput);
    div.appendChild(priceInput);
    div.appendChild(document.createElement("br"));
    div.appendChild(select);

    const removeBtn = document.createElement("button");
    removeBtn.textContent = "x";
    removeBtn.className = "remove-btn";
    removeBtn.onclick = () => {
      div.remove();
      updateTotal();
    };
    div.appendChild(removeBtn);

    manualContainer.appendChild(div);

    new Choices(select, {
      removeItemButton: true,
      placeholder: true,
      placeholderValue: "Select owner(s)",
    });
  }

  addBtn.addEventListener("click", () => createItem());

  document.getElementById("manual-form").addEventListener("submit", function (e) {
    e.preventDefault();

    const payer = payerSelect.value;
    const items = [];

    manualContainer.querySelectorAll(".ocr-item").forEach(item => {
      const name = item.querySelector(".item-name").value.trim();
      const price = parseFloat(item.querySelector(".price-input").value);
      const owners = Array.from(item.querySelector("select").selectedOptions).map(opt => opt.value);

      if (name && !isNaN(price) && owners.length > 0) {
        items.push({ name, price, owners });
      }
    });

    fetch("/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ paid_by: payer, items }]),
    })
      .then(res => res.json())
      .then(result => {
        const output = Object.entries(result)
          .map(([name, amount]) => {
            const num = Number(amount);
            return isNaN(num)
              ? `${name}: Invalid amount`
              : num < 0
              ? `${name} is owed $${Math.abs(num).toFixed(2)}`
              : `${name} owes $${num.toFixed(2)}`;
          })
          .join("<br>");

        document.getElementById("manual-results").innerHTML =
          `<div class="styled-result">${output}</div>`;

        // Save to history
        fetch("/confirm_transaction", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paid_by: payer, items }),
        }).then(() => {
          const msg = document.createElement("div");
          msg.textContent = "Transaction saved to history!";
          msg.style.color = "green";
          document.getElementById("manual-results").appendChild(msg);
        });
      });

    updateTotal();
  });

  createItem();
  updateTotal();
});

// ===== Receipt Upload Logic =====
document.getElementById("photo-form").addEventListener("submit", function (e) {
  e.preventDefault();

  const fileInput = document.getElementById("receipt-upload");
  const file = fileInput.files[0];

  if (!file) {
    alert("Please select a receipt image.");
    return;
  }

  const formData = new FormData();
  formData.append("receipt", file);

  fetch("/upload_receipt", {
    method: "POST",
    body: formData,
  })
    .then((res) => res.json())
    .then((data) => {
      const container = document.getElementById("results");
      container.innerHTML = "";

      if (data.error) {
        container.innerHTML = `<p style="color:red;">${data.error}</p>`;
        return;
      }

      const people = [data.user, ...data.friends.filter(f => f !== data.user)];

      const renderItem = (item, index) => {
        const div = document.createElement("div");
        div.classList.add("ocr-item");

        const label = document.createElement("span");
        label.textContent = `${item.name} - $${item.price.toFixed(2)}`;

        const select = document.createElement("select");
        select.classList.add("owner-select");
        select.setAttribute("multiple", "");
        select.dataset.index = index;

        people.forEach(name => {
          const option = document.createElement("option");
          option.value = name;
          option.textContent = name;
          select.appendChild(option);
        });

        const removeBtn = document.createElement("button");
        removeBtn.innerHTML = "✕";
        removeBtn.className = "remove-btn";
        removeBtn.onclick = () => div.remove();

        div.appendChild(label);
        div.appendChild(removeBtn);
        div.appendChild(document.createElement("br"));
        div.appendChild(select);

        new Choices(select, {
          removeItemButton: true,
          placeholder: true,
          placeholderValue: "Select owner(s)",
        });

        return div;
      };

      // Render items
      data.items.forEach((item, i) => {
        const div = renderItem(item, i);
        container.appendChild(div);
      });

      // Show total of receipt items
      const totalAmount = data.items.reduce((sum, item) => sum + item.price, 0);
      const totalDiv = document.createElement("div");
      totalDiv.className = "styled-result";
      totalDiv.style.fontWeight = "bold";
      totalDiv.style.marginTop = "10px";
      totalDiv.textContent = `Total detected from receipt: $${totalAmount.toFixed(2)}`;
      container.appendChild(totalDiv);

      // Add Item Button
      const addBtn = document.createElement("button");
      addBtn.textContent = "+ Add Item";
      addBtn.className = "add-btn";
      addBtn.onclick = () => {
        const newItem = renderItem({ name: "New Item", price: 0 }, Date.now());
        container.insertBefore(newItem, addBtn);
      };
      container.appendChild(addBtn);

      // Payer Section
      const payerSection = document.createElement("div");
      payerSection.style.marginTop = "15px";
      payerSection.style.display = "flex";
      payerSection.style.flexDirection = "column";
      payerSection.style.alignItems = "flex-start";
      payerSection.style.gap = "8px";

      const payerLabel = document.createElement("label");
      payerLabel.textContent = "Who paid?";
      payerLabel.style.fontWeight = "bold";

      const payerDropdown = document.createElement("select");
      payerDropdown.id = "payer-select";
      payerDropdown.style.padding = "5px";
      payerDropdown.style.fontFamily = "'Open Sans', sans-serif";
      payerDropdown.style.fontSize = "14px";

      people.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p;
        opt.textContent = p;
        payerDropdown.appendChild(opt);
      });

      payerSection.appendChild(payerLabel);
      payerSection.appendChild(payerDropdown);
      container.appendChild(payerSection);

      // Calculate Button
      const calcBtn = document.createElement("button");
      calcBtn.textContent = "Calculate Split";
      calcBtn.classList.add("calculate-btn");
      calcBtn.onclick = () => {
        const payer = document.getElementById("payer-select").value;
        const items = [];

        document.querySelectorAll(".ocr-item").forEach(div => {
          const label = div.querySelector("span")?.textContent || "Unknown - $0";
          const [name, priceText] = label.split(" - $");
          const price = parseFloat(priceText);
          const select = div.querySelector("select");
          const owners = Array.from(select.selectedOptions).map(opt => opt.value);

          if (owners.length > 0) {
            items.push({ name: name.trim(), price, owners });
          }
        });

        fetch("/calculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify([{ paid_by: payer, items }]),
        })
          .then(res => res.json())
          .then(result => {
            const outputDiv = document.createElement("div");
            outputDiv.className = "styled-result";

            Object.entries(result).forEach(([name, amount]) => {
              const num = Number(amount);
              if (isNaN(num)) return;

              const line = document.createElement("div");
              line.textContent = num < 0
                ? `${name} is owed $${Math.abs(num).toFixed(2)}`
                : `${name} owes $${num.toFixed(2)}`;
              outputDiv.appendChild(line);
            });

            container.appendChild(outputDiv);

            fetch("/confirm_transaction", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ paid_by: payer, items }),
            }).then(() => {
              const msg = document.createElement("div");
              msg.textContent = "Transaction saved to history!";
              msg.style.color = "green";
              outputDiv.appendChild(msg);
            });
          });
      };

      container.appendChild(document.createElement("br"));
      container.appendChild(calcBtn);
    });
});

// ===== Tab Switching Logic =====
function showTab(tabId, event) {
  document.querySelectorAll(".tab-content").forEach(tab => tab.classList.remove("active"));
  document.querySelectorAll(".tab-button").forEach(btn => btn.classList.remove("active"));
  document.getElementById(tabId).classList.add("active");
  event.target.classList.add("active");
}
