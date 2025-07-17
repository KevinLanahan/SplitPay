

document.getElementById("split-form").addEventListener("submit", function (e) {
    e.preventDefault();
  
    const payer = document.getElementById("payer").value.trim();
    const itemsRaw = document.getElementById("items").value.trim().split("\n");
  
    const items = itemsRaw.map((line) => {
      const parts = line.split(",").map((s) => s.trim());
      return {
        name: parts[0],
        price: parseFloat(parts[1]),
        owners: parts.slice(2),
      };
    });
  
    const data = [
      {
        paid_by: payer,
        items: items,
      },
    ];
  
    fetch("http://127.0.0.1:5000/calculate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    })
      .then((res) => res.json())
      .then((result) => {
        console.log("Result from server:", result);
  
        const output = Object.entries(result)
          .map(([name, amount]) => {
            const num = Number(amount);
            return isNaN(num)
              ? `${name}: Invalid amount`
              : num < 0
              ? `${name} is owed $${Math.abs(num).toFixed(2)}`
              : `${name} owes $${num.toFixed(2)}`;
          })
          .join("\n");
  
        document.getElementById("results").textContent = output;
      })
      .catch((err) => {
        document.getElementById("results").textContent =
          "Error: " + err.message;
      });
  });
  
