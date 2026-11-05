const API_URL = "http://localhost:3000";
const SESSION_KEY = "sageShoreUserId";
const REMEMBERED_USER_KEY = "sageShoreRememberedUser";

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options
    });
  } catch {
    throw new Error("Cannot reach the account server. Start it with npm run dev and try again.");
  }

  if (!response.ok) {
    throw new Error(`The account server returned an error (${response.status}). Please try again.`);
  }
  return response.status === 204 ? null : response.json();
}

function showStatus(form, message, isError = false) {
  const status = form.querySelector(".form-status");
  status.textContent = message;
  status.classList.toggle("form-status-error", isError);
}

function getUserId() {
  return localStorage.getItem(REMEMBERED_USER_KEY) || sessionStorage.getItem(SESSION_KEY);
}

function saveSession(userId, remember) {
  if (remember) {
    localStorage.setItem(REMEMBERED_USER_KEY, String(userId));
    sessionStorage.removeItem(SESSION_KEY);
  } else {
    sessionStorage.setItem(SESSION_KEY, String(userId));
    localStorage.removeItem(REMEMBERED_USER_KEY);
  }
}

function clearSession() {
  localStorage.removeItem(REMEMBERED_USER_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}

function validForm(form) {
  if (!form.checkValidity()) {
    form.reportValidity();
    return false;
  }
  return true;
}

async function register(form) {
  if (!validForm(form)) return;

  const fields = new FormData(form);
  const email = String(fields.get("email")).trim().toLowerCase();
  const password = String(fields.get("password"));
  if (password !== fields.get("password-confirm")) {
    showStatus(form, "Your passwords do not match.", true);
    return;
  }

  const existingUsers = await request(`/users?email=${encodeURIComponent(email)}`);
  if (existingUsers.length > 0) {
    showStatus(form, "An account with this email already exists. Please sign in instead.", true);
    return;
  }

  const user = await request("/users", {
    method: "POST",
    body: JSON.stringify({
      firstName: String(fields.get("first-name")).trim(),
      lastName: String(fields.get("last-name")).trim(),
      email,
      password,
      newsletter: fields.has("newsletter"),
      address: "",
      city: "",
      postcode: ""
    })
  });

  try {
    saveSession(user.id, true);
  } catch {
    showStatus(form, "Your account was created, but this browser could not save the sign-in. Please sign in.", true);
    return;
  }
  window.location.assign("profile.html");
}

async function signIn(form) {
  if (!validForm(form)) return;

  const fields = new FormData(form);
  const email = String(fields.get("email")).trim().toLowerCase();
  const users = await request(`/users?email=${encodeURIComponent(email)}`);
  const user = users.find((account) => account.password === fields.get("password"));

  if (!user) {
    showStatus(form, "We could not find an account with those details.", true);
    return;
  }

  try {
    saveSession(user.id, fields.has("remember"));
  } catch {
    showStatus(form, "Your browser could not save this sign-in. Check its storage settings and try again.", true);
    return;
  }
  window.location.assign("profile.html");
}

function bindForm(id, submit) {
  const form = document.getElementById(id);
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    showStatus(form, "");
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;

    try {
      await submit(form);
    } catch (error) {
      showStatus(form, error.message, true);
    } finally {
      button.disabled = false;
    }
  });
}

function populateProfile(user) {
  document.getElementById("profile-signed-out").hidden = true;
  document.getElementById("profile-signed-in").hidden = false;
  document.getElementById("profile-subtitle").textContent = `Welcome back, ${user.firstName}.`;
  document.getElementById("profile-avatar").textContent = user.firstName.charAt(0).toUpperCase();
  document.getElementById("profile-welcome-title").textContent = `Hello, ${user.firstName}.`;
  document.getElementById("profile-email").textContent = user.email;

  document.getElementById("profile-first-name").value = user.firstName;
  document.getElementById("profile-last-name").value = user.lastName;
  document.getElementById("profile-email-input").value = user.email;
  document.getElementById("profile-address").value = user.address || "";
  document.getElementById("profile-city").value = user.city || "";
  document.getElementById("profile-postcode").value = user.postcode || "";
}

async function updateProfileForm(form, userId, changes, successMessage) {
  if (!validForm(form)) return;

  const updatedUser = await request(`/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify(changes)
  });
  populateProfile(updatedUser);
  showStatus(form, successMessage);
}

function bindProfile() {
  if (!document.querySelector("[data-profile]")) return;

  const signedOut = document.getElementById("profile-signed-out");
  let userId;
  try {
    userId = getUserId();
  } catch {
    signedOut.querySelector("p").textContent = "Browser storage is unavailable. Enable storage to use the account demo.";
    return;
  }

  if (!userId) return;

  request(`/users/${encodeURIComponent(userId)}`)
    .then(populateProfile)
    .catch((error) => {
      signedOut.querySelector("p").textContent = error.message;
    });

  document.getElementById("signout-button").addEventListener("click", () => {
    try {
      clearSession();
      window.location.assign("login.html");
    } catch {
      document.getElementById("profile-email").textContent = "Could not clear this sign-in from browser storage.";
    }
  });

  bindForm("profile-details-form", async (form) => {
    const fields = new FormData(form);
    const email = String(fields.get("email")).trim().toLowerCase();
    const matches = await request(`/users?email=${encodeURIComponent(email)}`);
    if (matches.some((user) => String(user.id) !== String(userId))) {
      showStatus(form, "Another account already uses this email address.", true);
      return;
    }
    await updateProfileForm(form, userId, {
      firstName: String(fields.get("first-name")).trim(),
      lastName: String(fields.get("last-name")).trim(),
      email
    }, "Your details have been saved.");
  });

  bindForm("profile-address-form", async (form) => {
    const fields = new FormData(form);
    await updateProfileForm(form, userId, {
      address: String(fields.get("address")).trim(),
      city: String(fields.get("city")).trim(),
      postcode: String(fields.get("postcode")).trim()
    }, "Your delivery address has been saved.");
  });
}

bindForm("registration-form", register);
bindForm("login-form", signIn);
bindProfile();
