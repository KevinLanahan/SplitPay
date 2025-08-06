const monthlyBtn = document.getElementById('monthlyBtn');
const annualBtn = document.getElementById('annualBtn');
const monthlyPlans = document.querySelectorAll('.plan-monthly');
const annualPlans = document.querySelectorAll('.plan-annual');

// Monthly view toggle
monthlyBtn.addEventListener('click', () => {
  monthlyBtn.classList.add('active');
  annualBtn.classList.remove('active');

  monthlyPlans.forEach(plan => plan.style.display = 'block');
  annualPlans.forEach(plan => plan.style.display = 'none');
});

// Annual view toggle
annualBtn.addEventListener('click', () => {
  annualBtn.classList.add('active');
  monthlyBtn.classList.remove('active');

  monthlyPlans.forEach(plan => plan.style.display = 'none');
  annualPlans.forEach(plan => plan.style.display = 'block');
});
