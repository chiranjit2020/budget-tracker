const calDateButtons = document.querySelector("#cal-date-buttons");
const body = document.body;
const main = document.querySelector("main");
const userprofileBtn = document.querySelector("#user-profile-btn");
const date = new Date();
localStorage.setItem("trDate", date);
let userName = localStorage.getItem("userName");
let userEmail = localStorage.getItem("userEmail");
sessionStorage.removeItem("profileBlob");

generateFirstLine();

function generateFirstLine() {
    userName = localStorage.getItem("userName");
    if (!userName) {
        userName = "RandomUser";
    }
    const titleBlock = main.querySelector("header .app-subtitle");
    titleBlock.innerHTML = "";
    const title = document.createElement("p");
    title.innerHTML = `Hi <span>${userName.replace(
    / .*/,
    ""
  )}</span>, get your summary of your monthly
              transaction here.`;
    titleBlock.appendChild(title);
}

userprofileBtn.addEventListener("click", (e) => {
    e.preventDefault();
    let userName = "";
    const userProfile = document.createElement("div");
    userProfile.className = "user-profile";
    userProfile.innerHTML = makeUserProfile();
    main.appendChild(userProfile);
    body.className = "defuse";
    const file = userProfile.querySelector("input");
    const img = userProfile.querySelector(".image-block");
    file.addEventListener("input", (e) => {
        sessionStorage.setItem(
            "profileBlob",
            URL.createObjectURL(e.target.files[0])
        );
        img.style.backgroundImage = `url(${URL.createObjectURL(
      e.target.files[0]
    )})`;
        userprofileBtn.querySelector("img").src = `${URL.createObjectURL(
      e.target.files[0]
    )}`;
    });
    userProfile.querySelector("button.done").addEventListener("click", () => {
        userName = userProfile.querySelector("h2").innerText;
        userEmail = userProfile.querySelector("p").innerText;
        localStorage.setItem("userName", userName);
        localStorage.setItem("userEmail", userEmail);
        closeUI(userProfile);
        generateFirstLine();
    });
    userProfile.querySelector("h2").addEventListener("click", (e) => {
        e.target.setAttribute("contenteditable", "true");
        e.target.focus();
    });
    userProfile.querySelector("p").addEventListener("click", (e) => {
        e.target.setAttribute("contenteditable", "true");
        e.target.focus();
    });
});

calDateButtons.querySelectorAll("a").forEach((anc, idx) => {
    anc.addEventListener("click", () => {
        // if (idx == 0) {
        //   const calenderUi = document.createElement("div");
        //   calenderUi.className = "calendar-ui";
        //   calenderUi.innerHTML = makeCalenderUi();

        //   const calenderUiclose = calenderUi.querySelector(".calendar-close");

        //   calenderUiclose.addEventListener("click", () => {
        //     closeUI(calenderUi);
        //   });
        //   main.appendChild(calenderUi);
        //   calenderFunctionality();
        // }
        if (idx == 0) {
            const addTransactionSection = document.createElement("div");
            addTransactionSection.className = "add-transaction-section";
            addTransactionSection.innerHTML = makeTransactionSection();

            const addTransactionClose = addTransactionSection.querySelector(
                ".close-button"
            );
            addTransactionClose.addEventListener("click", () => {
                closeUI(addTransactionSection);
            });
            main.appendChild(addTransactionSection);
            flatpickr("#datetime", {
                enableTime: true,
                dateFormat: "J M, Y G:i K",
                onChange: showDate,
            });

            function showDate(e) {
                const date = e[0];
                const dateTimeTitle = addTransactionSection.querySelector("h2");
                dateTimeTitle.innerText = userFriendlyDate(date);
                console.log(date);
                console.log(localStorage.getItem("trDate"));
            }
            body.className = "defuse";
        }
    });
});

function userFriendlyDate(date) {
    function ordinal_suffix_of(i) {
        var j = i % 10,
            k = i % 100;
        if (j == 1 && k != 11) {
            return i + "st";
        }
        if (j == 2 && k != 12) {
            return i + "nd";
        }
        if (j == 3 && k != 13) {
            return i + "rd";
        }
        return i + "th";
    }
    const month_names_short = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

    let hour = date.getHours() <= 12 ? date.getHours() : date.getHours() - 12;
    hour = hour < 10 ? "0" + hour : hour;
    let min = date.getMinutes();
    min = min < 10 ? "0" + min : min;
    const ampm = date.getHours() < 12 ? "AM" : "PM";

    return `${ordinal_suffix_of(date.getDate())}  ${
    month_names_short[date.getMonth()]
  }, ${date.getFullYear()}	@ ${hour}:${min} ${ampm}`;
}

function closeUI(sectionName) {
    sectionName.remove();
    body.className = "";
}

function makeTransactionSection() {
    return `
      <div class="block">
        <button class="close-button">
          <i class="fas fa-times-circle"></i>
        </button>
        <h4>Transaction Details</h4>
        <h2>${userFriendlyDate(new Date())}</h2>
        <input
        class="flatpickr flatpickr-input active"
        id="datetime"
        type="text"
        placeholder="Select Transaction Date"
        data-id="datetime"
        readonly="readonly"
      />
        
        <div class="form-block">
          <label for="purpose">Transaction Purpose</label>
          <input type="text" class="tr-input" id="purpose"/>
          <div class="radio-box">
            <div class="box">
              <label for="received">Received</label>
              <input type="radio" name="tr" id="received" />
            </div>
            <div class="box">
              <label for="spent">Spent</label>
              <input type="radio" name="tr" id="spent" />
            </div>
            <div class="bottom-block">
              <div class="amount-section">
                <label for="number">Amount</label>
                <input type="number" class="tr-input number" id="number"/>
              </div>
            </div>
          </div>
              <button id="save-transaction">Save</button>
        </div>
      </div>
    `;
}

// function makeCalenderUi() {
//   const date = new Date();
//   let hour = date.getHours() <= 12 ? date.getHours() : date.getHours() - 12;
//   hour = hour < 10 ? "0" + hour : hour;
//   let min = date.getMinutes();
//   min = min < 10 ? "0" + min : min;
//   const ampm = date.getHours() < 12 ? "AM" : "PM";
//   return `
//       <div class="content-block">
//         <div class="month-year-panel">
//           <div class="month">
//             <select name="months" id="">
//               <option value="january">January</option>
//               <option value="february">February</option>
//               <option value="march">March</option>
//               <option value="april">April</option>
//               <option value="may">May</option>
//               <option value="june">June</option>
//               <option value="july">July</option>
//               <option value="august">August</option>
//               <option value="september">September</option>
//               <option value="october">October</option>
//               <option value="november">November</option>
//               <option value="december">December</option>
//             </select>
//           </div>
//           <!-- .month -->
//           <div class="year">
//             <select name="" id="">
//               <option value="">2020</option>
//               <option value="" selected>2021</option>
//               <option value="">2022</option>
//               <option value="">2023</option>
//               <option value="">2024</option>
//               <option value="">2025</option>
//               <option value="">2026</option>
//             </select>
//           </div>
//         </div>
//         <!-- .month-year-panel -->
//         <div class="day-date-panel">
//           <div class="day">
//             <ul>
//               <li>Su</li>
//               <li>Mo</li>
//               <li>Tu</li>
//               <li>We</li>
//               <li>Th</li>
//               <li>Fr</li>
//               <li>Sa</li>
//             </ul>
//           </div>
//           <div class="date">
//             <ul>
//               <li>01</li>
//               <li>02</li>
//               <li>03</li>
//               <li>04</li>
//               <li>05</li>
//               <li>06</li>
//               <li>07</li>
//               <li>08</li>
//               <li>09</li>
//               <li>10</li>
//               <li>11</li>
//               <li>12</li>
//               <li>13</li>
//               <li>14</li>
//               <li>15</li>
//               <li>16</li>
//               <li>17</li>
//               <li>18</li>
//               <li>19</li>
//               <li>20</li>
//               <li class="current">21</li>
//               <li>22</li>
//               <li>23</li>
//               <li>24</li>
//               <li>25</li>
//               <li>26</li>
//               <li>27</li>
//               <li>28</li>
//               <li>29</li>
//               <li>30</li>
//               <li>31</li>
//             </ul>
//           </div>
//           <!-- .date -->
//           <div class="time-panel" style="position:relative">
//             <input
//               type="time"
//               placeholder=""
//               class="form-control"
//               style="position:absolute; top:12; left:0; opacity:0; z-index:9; transform:rotate(180deg)"
//             />
//             <input
//               type="text"
//               placeholder="${hour + ":" + min + " " + ampm}"
//               class="form-control"

//             />
//           </div>
//         </div>
//       </div>
//       <button class="calendar-close">
//         <i class="fas fa-times-circle"></i>
//       </button>
//     `;
// }

function makeUserProfile() {
    return `
      <div class="image-block" style="background-image: url('${
        sessionStorage.getItem("profileBlob")
          ? sessionStorage.getItem("profileBlob")
          : `images/profile.jpg`
      }');">
        <div class="edit-icon">
          <label for="file"><i class="fas fa-edit"></i></label>
          <input type="file" accept="image/gif, image/jpeg, image/png" id="file" />
        </div>
      </div>

      <div class="user-details">
        <h2>${userName ? userName : "Random User"}</h2>
        <p>${userEmail ? userEmail : "example@gmail.com"}</p>
        <button class="done">Done</button>
      </div>
    `;
}
