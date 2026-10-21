console.log("Home JS loaded");
ssReady(function(){

const planCards = document.querySelectorAll(".plan-card");
const modeCards = document.querySelectorAll(".coffee-cards .card");

planCards.forEach(card => {

card.addEventListener("click", function(){

planCards.forEach(c => c.classList.remove("selected-plan"));
this.classList.add("selected-plan");

modeCards.forEach(m => m.classList.remove("suggested-mode"));

const plan = this.dataset.plan;

if(plan === "regular"){
document.querySelector('a[href*="daily"]').classList.add("suggested-mode");
}

if(plan === "exam"){
document.querySelector('a[href*="exam"]').classList.add("suggested-mode");
}

});

});

});