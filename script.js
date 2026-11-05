/* =========================================================
   FREE CHAT — COMPLETE SCRIPT
   Authentication + Home + Users + Real Chat + Realtime
========================================================= */


/* =========================================================
   GLOBAL CHAT STATE
========================================================= */

let currentConversationId = null;
let currentChatUserId = null;
let currentUserId = null;
let currentChatUser = null;
let messageChannel = null;
let replyingToComment = null;
let commentLikes = {};
/* =====================================
   TYPING INDICATOR STATE
===================================== */

let typingChannel = null;
let typingTimeout = null;
let isCurrentlyTyping = false;
let typingUserName = "";

/* =========================================================
   AUTH — LOGIN / SIGNUP SWITCH
========================================================= */

function showSignup() {

    document
        .getElementById("loginBox")
        .classList.add("hidden");

    document
        .getElementById("signupBox")
        .classList.remove("hidden");

    clearMessage();
}


function showLogin() {

    document
        .getElementById("signupBox")
        .classList.add("hidden");

    document
        .getElementById("loginBox")
        .classList.remove("hidden");

    clearMessage();
}


/* =========================================================
   PASSWORD VISIBILITY
========================================================= */

function togglePassword(inputId, button) {

    const input =
        document.getElementById(inputId);

    if (!input) return;

    if (input.type === "password") {

        input.type = "text";
        button.textContent = "🙈";

    } else {

        input.type = "password";
        button.textContent = "👁️";
    }
}


/* =========================================================
   SIGN UP
========================================================= */

async function signup(event) {

    event.preventDefault();

    const username =
        document
            .getElementById("signupUsername")
            .value
            .trim();

    const email =
        document
            .getElementById("signupEmail")
            .value
            .trim();

    const password =
        document
            .getElementById("signupPassword")
            .value;

    const confirm =
        document
            .getElementById("signupConfirm")
            .value;


    if (password !== confirm) {

        showMessage(
            "Passwords do not match.",
            "error"
        );

        return;
    }


    if (username.length < 3) {

        showMessage(
            "Username must be at least 3 characters.",
            "error"
        );

        return;
    }


    try {

        showMessage(
            "Creating your account...",
            "success"
        );


        const {
            data,
            error
        } =
            await supabaseClient.auth.signUp({

                email: email,

                password: password,

                options: {

                    data: {
                        username: username
                    }

                }

            });


        if (error) {
            throw error;
        }


        if (!data.user) {

            throw new Error(
                "Account could not be created."
            );
        }


        /*
           Create profile when a session exists.
        */

        if (data.session) {

            await createProfile(
                data.user,
                username
            );
        }


        showMessage(
            "Account created successfully! 🎉",
            "success"
        );


        document
            .getElementById("signupUsername")
            .value = "";

        document
            .getElementById("signupEmail")
            .value = "";

        document
            .getElementById("signupPassword")
            .value = "";

        document
            .getElementById("signupConfirm")
            .value = "";


    } catch (error) {

        console.error(
            "❌ Signup error:",
            error
        );

        showMessage(
            error.message ||
            "Unable to create account.",
            "error"
        );
    }
}

/* =========================================================
   CREATE PROFILE IF MISSING
========================================================= */

async function createProfile(user, username) {

    if (!user || !user.id) {
        console.error("❌ Cannot create profile: user is missing.");
        return false;
    }

    try {

        const {
            data: existingProfile,
            error: checkError
        } = await supabaseClient
            .from("profiles")
            .select("id")
            .eq("id", user.id)
            .maybeSingle();

        if (checkError) {
            console.error(
                "❌ Profile check failed:",
                checkError
            );
            return false;
        }

        // The profile already exists. Do not insert it again.
        if (existingProfile) {
            console.log("✅ Profile already exists.");
            return true;
        }

        const {
            error: insertError
        } = await supabaseClient
            .from("profiles")
            .insert({
                id: user.id,
                username:
                    username ||
                    user.user_metadata?.username ||
                    "FREE CHAT USER",
                email: user.email,
                online: true,
                last_seen: new Date().toISOString()
            });

        if (insertError) {

            // Another request may have created the profile
            // between our check and the insert.
            if (insertError.code === "23505") {

                console.log(
                    "✅ Profile already exists; skipping duplicate insert."
                );

                return true;
            }

            console.error(
                "❌ Profile creation failed:",
                insertError
            );

            return false;
        }

        console.log("✅ Profile created successfully.");

        return true;

    } catch (error) {

        console.error(
            "❌ Profile creation error:",
            error
        );

        return false;
    }
}

/* =========================================================
   LOGIN
========================================================= */

async function login(event) {

    event.preventDefault();


    const email =
        document
            .getElementById("loginEmail")
            .value
            .trim();

    const password =
        document
            .getElementById("loginPassword")
            .value;


    try {

        showMessage(
            "Logging you in...",
            "success"
        );


        const {
            data,
            error
        } =
            await supabaseClient.auth
                .signInWithPassword({

                    email: email,

                    password: password

                });


        if (error) {
            throw error;
        }
console.log("🔐 Login session check:", {
    hasUser: !!data.user,
    hasSession: !!data.session,
    userId: data.user?.id,
    sessionUserId: data.session?.user?.id
});

        console.log(
            "✅ Logged in user:",
            data.user
        );


        await createProfileIfMissing(
            data.user
        );

startSupportReplyNotifications();
        showMessage(
            "Login successful! 🎉",
            "success"
        );


    } catch (error) {

        console.error(
            "❌ Login error:",
            error
        );

        showMessage(
            error.message ||
            "Login failed.",
            "error"
        );
    }
}


/* =========================================================
   CREATE PROFILE IF MISSING
========================================================= */

async function createProfileIfMissing(user) {

    try {

        const {
            data: profile
        } =
            await supabaseClient
                .from("profiles")
                .select("id")
                .eq("id", user.id)
                .maybeSingle();


        if (profile) {
            return;
        }


        const username =
            user.user_metadata?.username ||
            "FREE CHAT USER";


        await createProfile(
            user,
            username
        );


    } catch (error) {

        console.error(
            "Profile check error:",
            error
        );
    }
}


/* =========================================================
   LOGOUT
========================================================= */



/* =========================================================
   SET USER OFFLINE
========================================================= */

async function setUserOffline() {

    try {

        const {
            data: {
                user
            }
        } =
            await supabaseClient.auth.getUser();


        if (!user) return;


        await supabaseClient
            .from("profiles")
            .update({

                online: false,

                last_seen:
                    new Date().toISOString()

            })
            .eq("id", user.id);

    } catch (error) {

        console.error(
            "Offline update error:",
            error
        );
    }
}


/* =========================================================
   FORGOT PASSWORD
========================================================= */

async function forgotPassword() {

    const email =
        document
            .getElementById("loginEmail")
            .value
            .trim();


    if (!email) {

        showMessage(
            "Enter your email first.",
            "error"
        );

        return;
    }


    try {

        showMessage(
            "Sending reset email...",
            "success"
        );


        const {
            error
        } =
            await supabaseClient.auth
                .resetPasswordForEmail(email);


        if (error) {
            throw error;
        }


        showMessage(
            "Password reset email sent! 📧",
            "success"
        );


    } catch (error) {

        console.error(
            "Password reset error:",
            error
        );

        showMessage(
            error.message ||
            "Unable to send reset email.",
            "error"
        );
    }
}


/* =========================================================
   AUTH MESSAGE
========================================================= */

function showMessage(text, type) {

    const message =
        document.getElementById(
            "authMessage"
        );

    if (!message) return;

    message.textContent = text;

    message.className =
        "show " + type;
}


function clearMessage() {

    const message =
        document.getElementById(
            "authMessage"
        );

    if (!message) return;

    message.textContent = "";

    message.className = "";
}

/* =====================================
   TYPING INDICATOR
===================================== */

async function setupTypingIndicator() {

    try {

        if (!currentConversationId) {
            console.warn("⚠️ No conversation for typing indicator.");
            return;
        }

        // Remove previous typing channel
        if (typingChannel) {
            try {
                await supabaseClient.removeChannel(typingChannel);
            } catch (error) {
                console.warn("⚠️ Could not remove old typing channel:", error);
            }

            typingChannel = null;
        }

        const channelName =
            `typing:${currentConversationId}`;

        typingChannel =
            supabaseClient.channel(channelName);

        typingChannel
            .on(
                "broadcast",
                {
                    event: "typing"
                },
                payload => {

                    const data = payload.payload || {};

                    // Ignore our own typing event
                    if (
                        data.userId &&
                        data.userId === currentUserId
                    ) {
                        return;
                    }

                    if (data.isTyping) {

                        typingUserName =
                            data.username ||
                            "Someone";

                        showTypingIndicator(
                            typingUserName
                        );

                    } else {

                        hideTypingIndicator();

                    }

                }
            );

        await typingChannel.subscribe();

        console.log(
            "⌨️ Typing indicator connected."
        );

    } catch (error) {

        console.error(
            "❌ Typing indicator setup error:",
            error
        );

    }
}
async function sendTypingStatus(isTyping) {

    try {

        if (
            !typingChannel ||
            !currentUserId ||
            !currentConversationId
        ) {
            return;
        }

        let username = "Someone";

        const {
            data: profile,
            error
        } = await supabaseClient
            .from("profiles")
            .select("username")
            .eq("id", currentUserId)
            .maybeSingle();

        if (!error && profile) {
            username =
                profile.username ||
                "Someone";
        }

        await typingChannel.send({
            type: "broadcast",
            event: "typing",
            payload: {
                userId: currentUserId,
                username: username,
                isTyping: isTyping
            }
        });

    } catch (error) {

        console.error(
            "❌ Typing status error:",
            error
        );

    }
}
function showTypingIndicator(username) {

    /* Message-area typing indicator */
    const indicator =
        document.getElementById("typingIndicator");

    const text =
        document.getElementById("typingIndicatorText");

    if (indicator && text) {

        text.textContent =
            `${username} is typing`;

        indicator.classList.remove("hidden");
    }


    /* Chat header typing status */
    const chatStatus =
        document.getElementById("chatStatus");

    if (chatStatus) {

        chatStatus.textContent =
            "⌨️ typing...";

        chatStatus.classList.add("typing-now");
    }
}


function hideTypingIndicator() {

    /* Hide message-area indicator */
    const indicator =
        document.getElementById("typingIndicator");

    if (indicator) {
        indicator.classList.add("hidden");
    }


    /* Restore normal chat status */
    const chatStatus =
        document.getElementById("chatStatus");

    if (chatStatus) {

        chatStatus.textContent =
            "🟢 Online";

        chatStatus.classList.remove(
            "typing-now"
        );
    }
}
function setupTypingInput() {

    const messageInput =
        document.getElementById(
            "messageInput"
        );

    if (!messageInput) {

        console.warn(
            "⚠️ messageInput not found."
        );

        return;
    }

    // Prevent duplicate listeners
    if (
        messageInput.dataset.typingReady === "true"
    ) {
        return;
    }

    messageInput.dataset.typingReady = "true";

    messageInput.addEventListener(
        "input",
        async () => {

            if (
                !currentConversationId
            ) {
                return;
            }

            const value =
                messageInput.value.trim();

            // User cleared the box
            if (!value) {

                clearTimeout(
                    typingTimeout
                );

                if (isCurrentlyTyping) {

                    isCurrentlyTyping =
                        false;

                    await sendTypingStatus(
                        false
                    );
                }

                return;
            }

            // Start typing
            if (!isCurrentlyTyping) {

                isCurrentlyTyping = true;

                await sendTypingStatus(
                    true
                );
            }

            // Reset stop timer
            clearTimeout(
                typingTimeout
            );

            typingTimeout =
                setTimeout(
                    async () => {

                        isCurrentlyTyping =
                            false;

                        await sendTypingStatus(
                            false
                        );

                    },
                    1800
                );

        }
    );

    console.log(
        "⌨️ Typing input ready."
    );
}
async function cleanupTypingIndicator() {

    clearTimeout(typingTimeout);

    isCurrentlyTyping = false;

    if (typingChannel) {

        try {

            await sendTypingStatus(false);

            await supabaseClient
                .removeChannel(
                    typingChannel
                );

        } catch (error) {

            console.warn(
                "⚠️ Typing cleanup error:",
                error
            );

        }

        typingChannel = null;
    }

    hideTypingIndicator();
}

/* =========================================================
   HOME
========================================================= */

async function showHome() {
    loadStories();

    console.log(
        "🏠 Opening FREE CHAT home..."
    );


    const authScreen =
        document.getElementById(
            "authScreen"
        );

    const homeScreen =
        document.getElementById(
            "homeScreen"
        );

    if (!authScreen || !homeScreen) {

        console.error(
            "❌ Home/auth screens not found."
        );

        return;
    }


    authScreen.classList.add(
        "hidden"
    );

    homeScreen.classList.remove(
        "hidden"
    );


    const friends =
    document.getElementById(
        "friendsScreen"
    );

if (friends) {
    friends.classList.add("hidden");
}


    const chat =
        document.getElementById(
            "chatScreen"
        );

    if (chat) {
        chat.classList.add("hidden");
        const groupsScreen = document.getElementById("groupsScreen");

if (groupsScreen) {
    groupsScreen.classList.add("hidden");
}

const homeScreen = document.getElementById("homeScreen");

if (homeScreen) {
    homeScreen.classList.remove("groups-mode");
}
    }
/* =====================================
🔥 LOAD POSTS WHEN HOME OPENS
===================================== */

console.log("📰 Loading social feed...");

try {
    if (typeof loadFeed === "function") {
        await loadFeed();
        console.log("✅ FREE CHAT home + feed displayed.");
    } else {
        console.error("❌ loadFeed() function was not found.");
    }
} catch (error) {
    console.error("❌ Failed to load home feed:", error);
}

    /* =========================================================
   LOAD CURRENT PROFILE
========================================================= */

async function loadCurrentProfile() {

    try {

        const {
            data: {
                user
            }
        } = await supabaseClient.auth.getUser();


        if (!user) {

            showLoginScreen();

            return;
        }


        /* CREATE PROFILE IF MISSING */

        if (typeof createProfileIfMissing === "function") {

            await createProfileIfMissing(user);

        }


        /* GET PROFILE */

        const {
            data: profile,
            error
        } = await supabaseClient
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .single();


        if (error) {

            console.error(
                "❌ Profile error:",
                error
            );

            return;
        }


        const username =
            profile.username ||
            "FREE CHAT";


        /* HOME USERNAME */

        const homeUsername =
            document.getElementById(
                "homeUsername"
            );

        if (homeUsername) {

            homeUsername.textContent =
                username;

        }


        /* PROFILE USERNAME */

        const profileUsername =
            document.getElementById(
                "profileUsername"
            );

        if (profileUsername) {

            profileUsername.textContent =
                username;

        }


        /* EMAIL */

        const profileEmail =
            document.getElementById(
                "profileEmail"
            );

        if (profileEmail) {

            profileEmail.textContent =
                profile.email ||
                user.email ||
                "";

        }


        /* AVATAR */

        if (profile.avatar_url) {

            const homeAvatar =
                document.getElementById(
                    "homeAvatar"
                );

            const profileAvatar =
                document.getElementById(
                    "profileAvatar"
                );


            if (homeAvatar) {

                homeAvatar.src =
                    profile.avatar_url;

            }


            if (profileAvatar) {

                profileAvatar.src =
                    profile.avatar_url;

            }
        }


        /* ONLINE STATUS */

        await supabaseClient
            .from("profiles")
            .update({

                online: true,

                last_seen:
                    new Date().toISOString()

            })
            .eq(
                "id",
                user.id
            );


        console.log(
            "✅ Profile loaded:",
            username
        );


    } catch (error) {

        console.error(
            "❌ Profile loading failed:",
            error
        );

    }
}


/* =====================================
   🔥 LOAD POSTS WHEN HOME OPENS
===================================== */

async function loadHomeFeed() {
    try {
        console.log("📰 Loading social feed...");

        // Load posts into the home feed
        await loadFeed();

        console.log("✅ FREE CHAT home + feed displayed.");

    } catch (error) {
        console.error("❌ Failed to load home feed:", error);
    }
}
}


/* =========================================================
   🎬 OPEN REELS SCREEN
========================================================= */

function openReelsScreen() {
    console.log("🎬 Opening FREE CHAT Reels...");

    const screenIds = [
        "authScreen",
        "homeScreen",
        "contactsScreen",
        "friendsScreen",
        "chatScreen",
        "notificationsScreen",
        "settingsScreen",
        "privacySettingsScreen",
        "blockedUsersScreen",
        "mainMenuScreen",
        "editProfileScreen",
        "profilePanel",
        "reelsScreen"
    ];

    // Hide all existing screens first
    screenIds.forEach(function(id) {
        const screen = document.getElementById(id);

        if (screen) {
            screen.classList.add("hidden");
        }
    });

    // Display Reels
    const reelsScreen =
        document.getElementById("reelsScreen");

    if (!reelsScreen) {
        console.error("❌ reelsScreen is missing from index.html");
        alert("Reels screen is missing. Please check index.html.");
        return;
    }

    reelsScreen.classList.remove("hidden");
// Load existing Reels whenever the screen opens.
if (typeof window.loadReelsFeed === "function") {
    window.loadReelsFeed();
}

// Allow the browser to render the Reels page
requestAnimationFrame(() => {
    requestAnimationFrame(() => {
        reelsScreen.style.visibility = "visible";
        reelsScreen.style.opacity = "1";

        console.log("✅ Reels screen rendered.");
    });
});
}


/* =========================================================
   SHOW LOGIN
========================================================= */

function showLoginScreen() {

    const home =
        document.getElementById(
            "homeScreen"
        );

    const auth =
        document.getElementById(
            "authScreen"
        );

    if (home) {
        home.classList.add("hidden");
    }

    if (auth) {
        auth.classList.remove("hidden");
    }
}

/* =========================================================
   👤 OPEN PROFILE
========================================================= */

async function openProfile() {

    console.log("👤 Opening Profile...");

    const profile = document.getElementById("profilePanel");

    if (!profile) {
        console.error("❌ profilePanel not found.");
        alert("Profile panel is missing.");
        return;
    }

    /* Hide every other screen */

    const screensToHide = [
        "homeScreen",
        "contactsScreen",
        "friendsScreen",
        "chatScreen",
        "notificationsScreen",
        "settingsScreen",
        "privacySettingsScreen",
        "blockedUsersScreen",
        "mainMenuScreen",
        "editProfileScreen"
    ];

    screensToHide.forEach(function(id) {

        const screen = document.getElementById(id);

        if (screen) {
            screen.classList.add("hidden");
        }

    });


    /* Show Profile */

    profile.classList.remove("hidden");


    /* Load profile information */

    if (typeof loadProfilePanelData === "function") {
        await loadProfilePanelData();
    }


    console.log("✅ Profile opened.");
}

/* =========================================================
   👤 LOAD PROFILE PANEL DATA
========================================================= */

async function loadProfilePanelData() {

    try {

        const {
            data: { user },
            error: userError
        } = await supabaseClient.auth.getUser();

        if (userError) {
            throw userError;
        }

        if (!user) {
            console.error("❌ No logged-in user.");
            return;
        }


        const {
            data: profile,
            error: profileError
        } = await supabaseClient
            .from("profiles")
            .select(`
                id,
                username,
                email,
                avatar_url
            `)
            .eq("id", user.id)
            .single();

        if (profileError) {
            throw profileError;
        }


        const username =
            document.getElementById(
                "profilePanelUsername"
            );

        const email =
            document.getElementById(
                "profilePanelEmail"
            );

        const avatar =
            document.getElementById(
                "profilePanelAvatar"
            );


        if (username) {
            username.textContent =
                profile?.username ||
                "FREE CHAT USER";
        }


        if (email) {
            email.textContent =
                profile?.email ||
                user.email ||
                "—";
        }


        if (avatar) {
            avatar.src =
                profile?.avatar_url ||
                "https://i.pravatar.cc/150?img=12";
        }
const detailUsername =
    document.getElementById("profileDetailUsername");

const detailEmail =
    document.getElementById("profileDetailEmail");

if (detailUsername) {
    detailUsername.textContent =
        profile?.username ||
        "FREE CHAT USER";
}

if (detailEmail) {
    detailEmail.textContent =
        profile?.email ||
        user.email ||
        "—";
}

        console.log("✅ Profile panel loaded.");

    } catch (error) {

        console.error(
            "❌ Profile loading error:",
            error
        );

    }
}

/* ==========================================
   ⚙️ SETTINGS & PRIVACY
========================================== */

function openSettings() {

    console.log("⚙️ Opening Settings & Privacy...");

    const home = document.getElementById("homeScreen");
    const menu = document.getElementById("mainMenuScreen");
    const friends = document.getElementById("friendsScreen");
    const contacts = document.getElementById("contactsScreen");
    const notifications = document.getElementById("notificationsScreen");
    const chat = document.getElementById("chatScreen");
    const privacy = document.getElementById("privacySettingsScreen");
    const blocked = document.getElementById("blockedUsersScreen");
    const settings = document.getElementById("settingsScreen");
    const editProfile = document.getElementById("editProfileScreen");

    /* Hide other screens */

    if (home) home.classList.add("hidden");
    if (menu) menu.classList.add("hidden");
    if (friends) friends.classList.add("hidden");
    if (contacts) contacts.classList.add("hidden");
    if (notifications) notifications.classList.add("hidden");
    if (chat) chat.classList.add("hidden");
    if (privacy) privacy.classList.add("hidden");
    if (blocked) blocked.classList.add("hidden");
    if (editProfile) editProfile.classList.add("hidden");

    /* Show Settings */

    if (settings) {

        settings.classList.remove("hidden");

        console.log("✅ Settings & Privacy opened.");

    } else {

        console.error(
            "❌ settingsScreen not found in index.html"
        );

        alert(
            "Settings screen could not be found.\n\n" +
            "Please check that your settingsScreen HTML exists."
        );

    }
}


/* ==========================================
   CLOSE SETTINGS
========================================== */

function closeSettings() {

    const settings =
        document.getElementById("settingsScreen");

    const privacy =
        document.getElementById("privacySettingsScreen");

    const blocked =
        document.getElementById("blockedUsersScreen");

    if (settings) {
        settings.classList.add("hidden");
    }

    if (privacy) {
        privacy.classList.add("hidden");
    }

    if (blocked) {
        blocked.classList.add("hidden");
    }

    const home =
        document.getElementById("homeScreen");

    if (home) {
        home.classList.remove("hidden");
    }

    console.log("🏠 Settings closed.");
}


/* ==========================================
   PROFILE FROM SETTINGS
========================================== */

function openProfileFromSettings() {

    closeSettings();

    if (typeof openProfile === "function") {
        openProfile();
    } else {
        console.error("❌ openProfile() not found.");
    }
}

/* ==========================================
   EDIT PROFILE
========================================== */

function openEditProfile() {

    alert(
        "✏️ Edit Profile\n\n" +
        "We will build the profile editor next."
    );
}

// ==========================================
// OPEN PRIVACY SETTINGS
// ==========================================

async function openPrivacySettings() {

    console.log("🔒 Opening Privacy Settings...");

    const settings = document.getElementById("settingsScreen");
    const privacy = document.getElementById("privacySettingsScreen");
    const home = document.getElementById("homeScreen");
    const menu = document.getElementById("mainMenuScreen");
    const friends = document.getElementById("friendsScreen");
    const contacts = document.getElementById("contactsScreen");
    const chat = document.getElementById("chatScreen");
    const blocked = document.getElementById("blockedUsersScreen");

    if (settings) {
        settings.classList.add("hidden");
    }

    if (home) {
        home.classList.add("hidden");
    }

    if (menu) {
        menu.classList.add("hidden");
    }

    if (friends) {
        friends.classList.add("hidden");
    }

    if (contacts) {
        contacts.classList.add("hidden");
    }

    if (chat) {
        chat.classList.add("hidden");
    }

    if (blocked) {
        blocked.classList.add("hidden");
    }

    if (privacy) {

        privacy.classList.remove("hidden");

        await loadPrivacySettings();

        console.log("✅ Privacy Settings opened.");

    } else {

        console.error(
            "❌ privacySettingsScreen not found."
        );

        alert(
            "Privacy Settings screen could not be found."
        );
    }
}


/* ==========================================
   SECURITY SETTINGS
========================================== */

function openSecuritySettings() {
    showFeaturePanel("security-settings");

    const title = document.getElementById("fcFeatureTitle");
    const subtitle = document.getElementById("fcFeatureSubtitle");
    const content = document.getElementById("fcFeatureContent");

    title.textContent = "🛡️ Security";
    subtitle.textContent = "Protect your FREE CHAT account";

    content.innerHTML = `
        <div class="fc-settings-options">

            <div class="fc-setting-option">
                <span>
                    <strong>🔐 Account Security</strong>
                    <small>You're using a FREE CHAT account.</small>
                </span>
            </div>

            <button
                type="button"
                class="fc-feature-row"
                id="fcSecurityChangePassword"
            >
                <span>
                    <strong>🔑 Change Password</strong><br>
                    <small>Update your account password</small>
                </span>
                <span>›</span>
            </button>

            <button
                type="button"
                class="fc-feature-row"
                id="fcSecurityProfilePrivacy"
            >
                <span>
                    <strong>👁️ Profile Privacy</strong><br>
                    <small>Review who can see your profile</small>
                </span>
                <span>›</span>
            </button>

            <button
                type="button"
                class="fc-feature-row"
                id="fcSecurityLogout"
            >
                <span>
                    <strong>🚪 Log Out</strong><br>
                    <small>Sign out of your account</small>
                </span>
                <span>›</span>
            </button>

        </div>
    `;

    document.getElementById("fcSecurityChangePassword")
        .addEventListener("click", () => {
            closeFeaturePanel();

            if (typeof openChangePassword === "function") {
                openChangePassword();
            } else {
                alert(
                    "Change Password is not connected yet. " +
                    "We need to connect your existing password screen."
                );
            }
        });

    document.getElementById("fcSecurityProfilePrivacy")
        .addEventListener("click", () => {
            closeFeaturePanel();

            if (typeof openPrivacySettings === "function") {
                openPrivacySettings();
            } else {
                alert(
                    "Your profile privacy settings need to be connected."
                );
            }
        });

    document.getElementById("fcSecurityLogout")
        .addEventListener("click", () => {
            closeFeaturePanel();

            if (typeof logoutFromSettings === "function") {
                logoutFromSettings();
            } else {
                alert("The logout function is not available.");
            }
        });
}


/* =========================================
   FREE CHAT SETTINGS PANELS
========================================= */

/* NOTIFICATION SETTINGS */

function openNotificationSettings() {
    showFeaturePanel("notification-settings");

    const title = document.getElementById("fcFeatureTitle");
    const subtitle = document.getElementById("fcFeatureSubtitle");
    const content = document.getElementById("fcFeatureContent");

    title.textContent = "🔔 Notification Settings";
    subtitle.textContent = "Choose which notifications you receive";

    const saved = JSON.parse(
        localStorage.getItem("fcNotificationPreferences") || "{}"
    );

    const options = [
        ["likes", "❤️ Likes", "When someone likes your post"],
        ["comments", "💬 Comments", "When someone comments on your post"],
        ["followers", "👥 New followers", "When someone follows you"],
        ["messages", "✉️ Messages", "When someone sends you a message"]
    ];

    content.innerHTML = `
        <div class="fc-settings-options">
            ${options.map(([key, label, description]) => `
                <label class="fc-setting-option">
                    <span>
                        <strong>${label}</strong>
                        <small>${description}</small>
                    </span>
                    <input
                        type="checkbox"
                        data-notification="${key}"
                        ${saved[key] !== false ? "checked" : ""}
                    >
                </label>
            `).join("")}
        </div>

        <button type="button" class="fc-settings-save"
            id="fcSaveNotificationSettings">
            💾 Save Preferences
        </button>
    `;

    document.getElementById("fcSaveNotificationSettings")
        .addEventListener("click", () => {
            const preferences = {};

            content.querySelectorAll("[data-notification]")
                .forEach(input => {
                    preferences[input.dataset.notification] = input.checked;
                });

            localStorage.setItem(
                "fcNotificationPreferences",
                JSON.stringify(preferences)
            );

            alert("✅ Notification preferences saved!");
        });
}


/* APPEARANCE */

function openAppearanceSettings() {
    showFeaturePanel("appearance-settings");

    document.getElementById("fcFeatureTitle").textContent = "🎨 Appearance";
    document.getElementById("fcFeatureSubtitle").textContent =
        "Choose how FREE CHAT looks";

    const content = document.getElementById("fcFeatureContent");
    const savedTheme = localStorage.getItem("fcAppearance") || "light";

    content.innerHTML = `
        <div class="fc-settings-options">
            <label class="fc-setting-option">
                <span>
                    <strong>☀️ Light Mode</strong>
                    <small>Use a light background</small>
                </span>
                <input type="radio" name="fcTheme" value="light"
                    ${savedTheme === "light" ? "checked" : ""}>
            </label>

            <label class="fc-setting-option">
                <span>
                    <strong>🌙 Dark Mode</strong>
                    <small>Use a dark background</small>
                </span>
                <input type="radio" name="fcTheme" value="dark"
                    ${savedTheme === "dark" ? "checked" : ""}>
            </label>
        </div>

        <button type="button" class="fc-settings-save"
            id="fcSaveAppearance">
            💾 Apply Appearance
        </button>
    `;

    document.getElementById("fcSaveAppearance")
        .addEventListener("click", () => {
            const selected = content.querySelector(
                'input[name="fcTheme"]:checked'
            );

            if (!selected) return;

            localStorage.setItem("fcAppearance", selected.value);
            document.documentElement.dataset.theme = selected.value;

            alert("✅ Appearance saved!");
        });
}

/* LANGUAGE */

function openLanguageSettings() {
showFeaturePanel("language-settings");

document.getElementById("fcFeatureTitle").textContent = "🌐 Language";
document.getElementById("fcFeatureSubtitle").textContent =
    "Choose your preferred language";

const content = document.getElementById("fcFeatureContent");
const savedLanguage = localStorage.getItem("fcLanguage") || "en";

const languages = [
    ["en", "🇬🇧 English"],
    ["yo", "🇳🇬 Yoruba"],
    ["ha", "🇳🇬 Hausa"],
    ["ig", "🇳🇬 Igbo"],
    ["fr", "🇫🇷 French"],
    ["es", "🇪🇸 Spanish"],
    ["pt", "🇵🇹 Portuguese"],
    ["ar", "🌍 Arabic"],
    ["zh", "🇨🇳 Chinese (Simplified)"],
    ["hi", "🇮🇳 Hindi"],
    ["de", "🇩🇪 German"],
    ["it", "🇮🇹 Italian"],
    ["sw", "🇰🇪 Swahili"],
    ["ja", "🇯🇵 Japanese"],
    ["ko", "🇰🇷 Korean"],
    ["ru", "🇷🇺 Russian"]
];

content.innerHTML = `
    <label class="fc-feature-label" for="fcLanguageSelect">
        App language
    </label>

    <select id="fcLanguageSelect" class="fc-feature-input">
        ${languages.map(([code, name]) => `
            <option value="${code}"
                ${savedLanguage === code ? "selected" : ""}>
                ${name}
            </option>
        `).join("")}
    </select>

    <p class="fc-feature-empty">
        Choose the language you prefer for using FREE CHAT.
    </p>

    <button type="button" class="fc-settings-save"
        id="fcSaveLanguage">
        💾 Save Language
    </button>
`;

document.getElementById("fcSaveLanguage")
.addEventListener("click", () => {
const language =
document.getElementById("fcLanguageSelect").value;

    localStorage.setItem("fcLanguage", language);

    // Apply the selected language to translated interface text.
    if (typeof applyAppLanguage === "function") {
        applyAppLanguage(language);
    }

    alert("✅ Language preference saved!");
});

}


/* ABOUT FREE CHAT */

function showAboutFreeChat() {
    showFeaturePanel("about-free-chat");

    document.getElementById("fcFeatureTitle").textContent =
        "ℹ️ About FREE CHAT";

    document.getElementById("fcFeatureSubtitle").textContent =
        "Connect. Chat. Stay close.";

    document.getElementById("fcFeatureContent").innerHTML = `
        <div class="fc-about-content">
            <div class="fc-about-logo">💬</div>
            <h2>FREE CHAT</h2>
            <p><strong>Connect. Chat. Stay close.</strong></p>
            <p>
                FREE CHAT is a social communication app designed to help
                people connect, share posts, watch Reels, and chat with friends.
            </p>
            <p class="fc-about-version">Version 1.0</p>
        </div>
    `;
}

/* ==========================================
   ✏️ EDIT PROFILE
========================================== */

let selectedProfilePhoto = null;


/* OPEN EDIT PROFILE */

async function openEditProfile() {

    console.log("✏️ Opening Edit Profile...");

    const settings = document.getElementById("settingsScreen");
    const menu = document.getElementById("mainMenuScreen");
    const home = document.getElementById("homeScreen");
    const editScreen = document.getElementById("editProfileScreen");

    if (!editScreen) {
        console.error("❌ editProfileScreen not found.");
        return;
    }

    if (settings) settings.classList.add("hidden");
    if (menu) menu.classList.add("hidden");
    if (home) home.classList.add("hidden");

    editScreen.classList.remove("hidden");

    selectedProfilePhoto = null;

    await loadEditProfile();
}

/* LOAD PROFILE */

async function loadEditProfile() {

    try {

        const {
            data: { user },
            error: userError
        } = await supabaseClient.auth.getUser();

        if (userError) {
            throw userError;
        }

        if (!user) {
            return;
        }


        const {
            data: profile,
            error
        } = await supabaseClient
            .from("profiles")
            .select("username, email, avatar_url, bio, gender")
            .eq("id", user.id)
            .maybeSingle();

        if (error) {
            throw error;
        }


        /* USERNAME */

        const username =
            document.getElementById("editUsername");

        if (username) {

            username.value =
                profile?.username || "";

        }


        /* BIO */

        const bio =
            document.getElementById("editBio");

        if (bio) {

            bio.value =
                profile?.bio || "";

            if (
                typeof updateBioCharacterCount ===
                "function"
            ) {

                updateBioCharacterCount();

            }

        }


        /* EMAIL */

        const email =
            document.getElementById("editProfileEmail");

        if (email) {

            email.textContent =
                profile?.email ||
                user.email ||
                "No email";

        }


        /* AVATAR */

        const avatar =
            document.getElementById("editProfileAvatar");

        if (
            avatar &&
            profile?.avatar_url
        ) {

            avatar.src =
                profile.avatar_url;

        }


        /* GENDER */

        const gender =
            profile?.gender || "";

        const maleRadio =
            document.getElementById("genderMale");

        const femaleRadio =
            document.getElementById("genderFemale");


        if (maleRadio) {

            maleRadio.checked =
                gender === "male";

        }


        if (femaleRadio) {

            femaleRadio.checked =
                gender === "female";

        }


        console.log(
            "✅ Edit profile loaded."
        );


    } catch (error) {

        console.error(
            "❌ Could not load profile:",
            error
        );

        alert(
            "Could not load your profile.\n\n" +
            (
                error.message ||
                "Please try again."
            )
        );

    }

}

/* PREVIEW PHOTO */

function previewProfilePhoto(event) {

    const file =
        event.target.files?.[0];

    if (!file) return;


    if (!file.type.startsWith("image/")) {

        alert("Please select an image.");

        event.target.value = "";

        return;
    }


    selectedProfilePhoto = file;


    const avatar =
        document.getElementById("editProfileAvatar");

    if (avatar) {

        avatar.src =
            URL.createObjectURL(file);

    }
}


/* BIO COUNTER */

function updateBioCharacterCount() {

    const bio =
        document.getElementById("editBio");

    const counter =
        document.getElementById("bioCharacterCount");

    if (!bio || !counter) return;

    counter.textContent =
        bio.value.length;
}


document.addEventListener("input", function(event) {

    if (event.target &&
        event.target.id === "editBio") {

        updateBioCharacterCount();
    }

});


/* SAVE PROFILE */
async function saveProfileChanges() {

    const button =
        document.querySelector(".save-profile-btn");

    const username =
        document.getElementById("editUsername")?.value.trim();

    const bio =
        document.getElementById("editBio")?.value.trim();

    /* ⚥ GET GENDER */

    const gender =
        document.querySelector(
            'input[name="gender"]:checked'
        )?.value || null;


    if (!username) {

        alert("Please enter a username.");

        return;
    }


    if (username.length < 3) {

        alert(
            "Username must be at least 3 characters."
        );

        return;
    }


    try {

        const {
            data: { user },
            error: userError
        } = await supabaseClient.auth.getUser();

        if (userError) throw userError;

        if (!user) {

            alert("Please login first.");

            return;
        }


        if (button) {

            button.disabled = true;
            button.textContent = "Saving...";

        }


        let avatarUrl = null;


        /* ==========================================
           📸 UPLOAD NEW PHOTO
        ========================================== */

        if (selectedProfilePhoto) {

            const file =
                selectedProfilePhoto;

            const extension =
                file.name
                    .split(".")
                    .pop()
                    .toLowerCase();

const filePath =
    `${user.id}/${Date.now()}.${extension}`;


            const { error: uploadError } =
                await supabaseClient.storage
                    .from("profile-images")
                    .upload(
                        filePath,
                        file,
                        {
                            upsert: true,
                            contentType: file.type
                        }
                    );


            if (uploadError) {

                throw new Error(
                    "Profile picture upload failed: " +
                    uploadError.message
                );

            }


            const { data: publicUrlData } =
                supabaseClient.storage
                    .from("profile-images")
                    .getPublicUrl(filePath);


            avatarUrl =
                publicUrlData.publicUrl;
        }


        /* ==========================================
           👤 UPDATE PROFILE
        ========================================== */

        const updateData = {

            username: username,

            bio: bio || null,

            gender: gender

        };


        if (avatarUrl) {

            updateData.avatar_url =
                avatarUrl;

        }


        const { error: updateError } =
            await supabaseClient
                .from("profiles")
                .update(updateData)
                .eq("id", user.id);


        if (updateError) {

            throw updateError;

        }


        /* ==========================================
           🔄 REFRESH PROFILE
        ========================================== */

        if (
            typeof loadCurrentProfile ===
            "function"
        ) {

            await loadCurrentProfile();

        }


        if (
            typeof loadMenuProfile ===
            "function"
        ) {

            await loadMenuProfile();

        }


        alert(
            "✅ Profile updated successfully!"
        );


        closeEditProfile();


    } catch (error) {

        console.error(
            "❌ Profile update failed:",
            error
        );

        alert(
            "Could not update your profile.\n\n" +
            (
                error.message ||
                "Please try again."
            )
        );


    } finally {

        if (button) {

            button.disabled = false;

            button.textContent =
                "💾 Save Changes";

        }

    }

}


/* CLOSE */

function closeEditProfile() {

    const editScreen =
        document.getElementById("editProfileScreen");

    const settings =
        document.getElementById("settingsScreen");

    if (editScreen) {

        editScreen.classList.add("hidden");

    }

    if (settings) {

        settings.classList.remove("hidden");

    }

    console.log("⚙️ Returned to Settings.");

}

/* =========================================================
   👤 OTHER USER PROFILE
========================================================= */

let currentViewedUserId = null;

// Store which app screens were visible before opening another user's profile.
// This lets the Back button return to Community Chat, Communities, or Home.
let userProfileReturnScreens = ["homeScreen"];

const USER_PROFILE_MANAGED_SCREENS = [
    "homeScreen",
    "contactsScreen",
    "friendsScreen",
    "chatScreen",
    "notificationsScreen",
    "settingsScreen",
    "privacySettingsScreen",
    "blockedUsersScreen",
    "mainMenuScreen",
    "profilePanel",
    "reelsScreen",
    "groupsScreen",
    "communityChatScreen"
];

/* =========================================================
   OPEN OTHER USER PROFILE
========================================================= */

async function openUserProfile(userId) {
    console.log("👤 Opening user profile:", userId);

    if (!userId) {
        console.error("❌ No user ID provided.");
        return;
    }

    const profileScreen = document.getElementById("userProfileScreen");

    if (!profileScreen) {
        console.error("❌ userProfileScreen not found.");
        alert("User profile screen is missing.");
        return;
    }

    // Remember the visible screen(s) before hiding them. Some views, such as
    // Communities, intentionally keep Home visible for the bottom navigation.
    userProfileReturnScreens = USER_PROFILE_MANAGED_SCREENS.filter(id => {
        const screen = document.getElementById(id);
        return screen && !screen.classList.contains("hidden");
    });

    if (!userProfileReturnScreens.length) {
        userProfileReturnScreens = ["homeScreen"];
    }

    currentViewedUserId = userId;

    // Hide every relevant app view, including Community Chat. Its z-index is
    // higher than the profile view, so leaving it visible would cover the profile.
    USER_PROFILE_MANAGED_SCREENS.forEach(id => {
        document.getElementById(id)?.classList.add("hidden");
    });

    profileScreen.classList.remove("hidden");

    try {
        await loadUserProfile(userId);
    } finally {
        // Keep the profile on top after asynchronous profile/stat requests.
        profileScreen.classList.remove("hidden");
    }

    console.log(
        "Profile screen visibility:",
        !profileScreen.classList.contains("hidden")
    );

    if (typeof window.setupUserProfileTabs === "function") {
        window.setupUserProfileTabs();
    }
}


async function showProfileConnections(userId, type) {
    if (!userId) {
        console.error("Missing profile user ID.");
        return;
    }

    const panel = fcEnsureFeaturePanel();
    const title = document.getElementById("fcFeatureTitle");
    const subtitle = document.getElementById("fcFeatureSubtitle");
    const content = document.getElementById("fcFeatureContent");

    const isFollowers = type === "followers";

    title.textContent = isFollowers ? "👥 Followers" : "➡️ Following";
    subtitle.textContent = "Loading people...";
    content.innerHTML = '<p class="fc-feature-empty">Loading...</p>';

    panel.dataset.feature = "profile-connections";
    panel.classList.remove("hidden");

    try {
        const { data: connections, error } = await supabaseClient
            .from("user_follows")
            .select("follower_id, following_id")
            .eq(isFollowers ? "following_id" : "follower_id", userId);

        if (error) throw error;

        const connectionIds = (connections || []).map(row =>
            isFollowers ? row.follower_id : row.following_id
        );

        if (!connectionIds.length) {
            subtitle.textContent = "0 people";
            content.innerHTML =
                '<p class="fc-feature-empty">No people to show yet.</p>';
            return;
        }

        const uniqueIds = [...new Set(connectionIds)];

        const { data: profiles, error: profileError } = await supabaseClient
            .from("profiles")
            .select("*")
            .in("id", uniqueIds);

        if (profileError) throw profileError;

        subtitle.textContent = `${uniqueIds.length} ${isFollowers ? "followers" : "following"}`;
        content.innerHTML = "";

        (profiles || []).forEach(profile => {
            const row = document.createElement("button");
            row.type = "button";
            row.className = "fc-feature-row";

            row.textContent =
                profile.username ||
                profile.full_name ||
                profile.name ||
                "FREE CHAT user";

            row.addEventListener("click", async () => {
                closeFeaturePanel();
                await openUserProfile(profile.id);
            });

            content.appendChild(row);
        });

        if (!profiles || !profiles.length) {
            content.innerHTML =
                '<p class="fc-feature-empty">Profiles could not be found.</p>';
        }

    } catch (error) {
        console.error("Profile connections error:", error);
        subtitle.textContent = "Could not load connections";
        content.innerHTML =
            '<p class="fc-feature-empty">Could not load this list. Please try again.</p>';
    }
}
window.openUserProfile = openUserProfile;
/* =========================================================
   LOAD OTHER USER PROFILE
========================================================= */

async function loadUserProfile(userId) {

    try {

        /* -------------------------------
           PROFILE
        ------------------------------- */

        const {
            data: profile,
            error: profileError
        } = await supabaseClient
            .from("profiles")
            .select(`id,username,avatar_url`)
            
            .eq("id", userId)
            .single();


        if (profileError) {
            throw profileError;
        }


        if (!profile) {
            alert("User profile not found.");
            return;
        }


        /* -------------------------------
           BASIC INFO
        ------------------------------- */

        const avatar =
            document.getElementById(
                "userProfileAvatar"
            );

        const username =
            document.getElementById(
                "userProfileUsername"
            );

        const handle =
    document.getElementById(
        "userProfileUsernameHandle"
    );




        if (avatar) {
            avatar.src =
                profile.avatar_url ||
                "https://i.pravatar.cc/160?img=12";
        }


        if (username) {
            username.textContent =
                profile.username ||
                "FREE CHAT USER";
        }


        if (handle) {
    handle.textContent =
        profile.username
            ? "@" + profile.username
            : "";

        }


        /* -------------------------------
           TOTAL POSTS
        ------------------------------- */

        const {
            count: postCount,
            error: postError
        } = await supabaseClient
            .from("posts")
            .select("id", {
                count: "exact",
                head: true
            })
            .eq("user_id", userId);


        if (postError) {
            console.error(
                "❌ Post count error:",
                postError
            );
        }


        const postCountElement =
            document.getElementById(
                "userProfilePostCount"
            );


        if (postCountElement) {
            postCountElement.textContent =
                postCount || 0;
        }


        /* -------------------------------
           TOTAL FRIENDS
        ------------------------------- */

        const {
            count: friendCount,
            error: friendError
        } = await supabaseClient
            .from("friendships")
            .select("id", {
                count: "exact",
                head: true
            })
            .eq("user_id", userId);


        if (friendError) {
            console.error(
                "❌ Friend count error:",
                friendError
            );
        }


        const friendCountElement =
            document.getElementById(
                "userProfileFriendCount"
            );


        if (friendCountElement) {
            friendCountElement.textContent =
                friendCount || 0;
        }


        /* -------------------------------
           LOAD POSTS
        ------------------------------- */

    await loadUserProfilePosts(userId);
await loadUserProfileReels(userId);
await loadUserProfileFollow(userId);

// Connect Followers and Following buttons
const followersButton = document.getElementById(
    "userProfileFollowersButton"
);

const followingButton = document.getElementById(
    "userProfileFollowingButton"
);

if (followersButton) {
    followersButton.onclick = () => {
        showProfileConnections(userId, "followers");
    };
}

if (followingButton) {
    followingButton.onclick = () => {
        showProfileConnections(userId, "following");
    };
}

        /* -------------------------------
           FRIEND BUTTON
        ------------------------------- */

        await updateUserProfileFriendButton(userId);


        /* -------------------------------
           MESSAGE BUTTON
        ------------------------------- */

        const messageButton =
            document.getElementById(
                "userProfileMessageButton"
            );


        if (messageButton) {

            messageButton.onclick = function () {

                startChatWithUser(userId);

            };
        

        }


        console.log("✅ User profile loaded.");

    } catch (error) {

        console.error(
            "❌ User profile error:",
            error
        );

        alert(
            "Could not load this profile.\n\n" +
            (error.message || "Please try again.")
        );

    }

}


/* =========================================================
   LOAD USER POSTS
========================================================= */

async function loadUserProfilePosts(userId) {

    const container =
        document.getElementById(
            "userProfilePosts"
        );

    if (!container) return;


    container.innerHTML = `
        <div class="user-profile-loading">
            Loading posts...
        </div>
    `;


    try {

        const {
            data: posts,
            error
        } = await supabaseClient
            .from("posts")
            .select(`
                id,
                content,
                image_url,
                media_type,
                created_at
            `)
            .eq("user_id", userId)
            .order("created_at", {
                ascending: false
            });


        if (error) {
            throw error;
        }


        if (!posts || posts.length === 0) {

            container.innerHTML = `
                <div class="user-profile-empty">
                    📝 No posts yet.
                </div>
            `;

            return;
        }


        container.innerHTML =
            posts.map(post => {

                return `
                    <article class="user-profile-post">

                        ${
                            post.content
                            ? `
                                <p>
                                    ${escapeHTML(
                                        post.content
                                    )}
                                </p>
                              `
                            : ""
                        }

                        ${
                            post.image_url
                            ? (post.media_type === "video"
                                ? `<video class="post-image" src="${escapeHTML(post.image_url)}" controls playsinline preload="metadata"></video>`
                                : `<img class="post-image" src="${escapeHTML(post.image_url)}" alt="Post" loading="lazy">`)
                            : ""
                        }

                        <small>
                            ${formatTime(
                                post.created_at
                            )}
                        </small>

                    </article>
                `;

            }).join("");


    } catch (error) {

        console.error(
            "❌ User posts error:",
            error
        );

        container.innerHTML = `
            <div class="user-profile-empty">
                ❌ Could not load posts.
            </div>
        `;

    }

}


/* =========================================================
   FRIEND BUTTON STATUS
========================================================= */

async function updateUserProfileFriendButton(userId) {

    const button =
        document.getElementById(
            "userProfileFriendButton"
        );

    if (!button) return;


    try {

        const {
            data: { user },
            error: userError
        } = await supabaseClient.auth.getUser();


        if (userError) throw userError;

        if (!user || user.id === userId) {

            button.style.display = "none";

            return;
        }


        button.style.display = "inline-flex";


        /* Check friendship */

        const {
            data: friendship
        } = await supabaseClient
            .from("friendships")
            .select("id")
            .eq("user_id", user.id)
            .eq("friend_id", userId)
            .maybeSingle();


        if (friendship) {

            button.textContent = "✓ Friends";

            button.onclick = function () {
                alert("You are already friends.");
            };

            return;
        }


        /* Check request */

        const {
            data: request
        } = await supabaseClient
            .from("friend_requests")
            .select("id, sender_id, receiver_id, status")
            .or(
                `and(sender_id.eq.${user.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${user.id})`
            )
            .eq("status", "pending")
            .maybeSingle();


        if (request) {

            if (request.sender_id === user.id) {

                button.textContent =
                    "⏳ Request Sent";

                button.onclick = function () {
                    alert("Friend request already sent.");
                };

            } else {

                button.textContent =
                    "📩 Respond";

                button.onclick = function () {

                    openNotifications();

                };

            }

            return;
        }


        /* Add friend */

        button.textContent =
            "➕ Add Friend";

        button.onclick = function () {

            sendFriendRequest(userId);

        };


    } catch (error) {

        console.error(
            "❌ Friend button error:",
            error
        );

    }

}


/* =========================================================
   CLOSE OTHER USER PROFILE
========================================================= */

function closeUserProfile() {
    console.log("👤 Closing user profile...");

    document.getElementById("userProfileScreen")?.classList.add("hidden");

    // Clear the managed views, then restore exactly the screens that were
    // visible before the profile opened. This preserves the community chat.
    USER_PROFILE_MANAGED_SCREENS.forEach(id => {
        document.getElementById(id)?.classList.add("hidden");
    });

    const screensToRestore = userProfileReturnScreens.length
        ? userProfileReturnScreens
        : ["homeScreen"];

    screensToRestore.forEach(id => {
        document.getElementById(id)?.classList.remove("hidden");
    });

    currentViewedUserId = null;
    userProfileReturnScreens = ["homeScreen"];

    console.log("✅ Returned to the previous screen.");
}



/* =========================================================
   💬 OPEN NEW CHAT / CONTACTS
========================================================= */
function newChat() {
 
    console.log("💬 Opening Chats...");


    const home =
        document.getElementById("homeScreen");

    const contacts =
        document.getElementById("contactsScreen");

    const friends =
        document.getElementById("friendsScreen");

    const chat =
        document.getElementById("chatScreen");

    const notifications =
        document.getElementById("notificationsScreen");


    if (!contacts) {

        console.error(
            "❌ contactsScreen not found."
        );

        return;
    }


    /* 🏠 HIDE HOME */

    if (home) {
        home.classList.add("hidden");
    }


    /* 👥 HIDE FRIENDS */

    if (friends) {
        friends.classList.add("hidden");
    }


    /* 💬 HIDE REAL CHAT */

    if (chat) {
        chat.classList.add("hidden");
    }


    /* 🔔 HIDE NOTIFICATIONS */

    if (notifications) {
        notifications.classList.add("hidden");
    }


    /* 👥 SHOW CONTACTS */

    contacts.classList.remove("hidden");


    loadUsers();

}



/* =========================================================
   LOAD USERS
========================================================= */

async function loadUsers() {

    const usersList =
        document.getElementById("usersList");

    if (!usersList) return;

    usersList.innerHTML = `
        <div class="users-loading">
            Loading users...
        </div>
    `;

    try {

        const {
            data: {
                user: currentUser
            },
            error: userError
        } =
            await supabaseClient.auth.getUser();

        if (userError) throw userError;

        if (!currentUser) {

            usersList.innerHTML = `
                <div class="users-empty">
                    Please login first.
                </div>
            `;

            return;
        }


        /* =====================================
           👥 LOAD OTHER USERS
        ===================================== */

        const {
            data: users,
            error
        } =
            await supabaseClient
                .from("profiles")
                .select(`
                    id,
                    username,
                    email,
                    avatar_url,
                    online,
                    last_seen
                `)
                .neq(
                    "id",
                    currentUser.id
                )
                .order(
                    "username",
                    {
                        ascending: true
                    }
                );

        if (error) throw error;


        /* =====================================
           💚 LOAD FRIENDSHIPS
        ===================================== */

        const {
            data: friendships,
            error: friendsError
        } =
            await supabaseClient
                .from("friends")
                .select(`
                    user_id,
                    friend_id
                `)
                .or(
                    `user_id.eq.${currentUser.id},friend_id.eq.${currentUser.id}`
                );

        if (friendsError) throw friendsError;


        /* =====================================
           👥 LOAD FRIEND REQUESTS
        ===================================== */

        const {
            data: requests,
            error: requestsError
        } =
            await supabaseClient
                .from("friend_requests")
                .select(`
                    id,
                    sender_id,
                    receiver_id,
                    status
                `)
                .or(
                    `sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`
                );

        if (requestsError) throw requestsError;


        renderUsers(
            users,
            friendships || [],
            requests || [],
            currentUser.id
        );


    } catch (error) {

        console.error(
            "❌ User loading error:",
            error
        );

        usersList.innerHTML = `
            <div class="users-empty">

                <div>⚠️</div>

                <h3>
                    Unable to load users
                </h3>

                <p>
                    ${escapeHTML(
                        error.message ||
                        "Please try again."
                    )}
                </p>

            </div>
        `;
    }
}

/* =========================================================
   DISPLAY USERS
========================================================= */

function renderUsers(
    users,
    friendships,
    requests,
    currentUserId
) {

    const usersList =
        document.getElementById("usersList");

    if (!usersList) return;


    if (
        !users ||
        users.length === 0
    ) {

        usersList.innerHTML = `
            <div class="users-empty">

                <div>👥</div>

                <h3>
                    No other users yet
                </h3>

                <p>
                    Invite someone to join FREE CHAT.
                </p>

            </div>
        `;

        return;
    }


    usersList.innerHTML =
        users.map(user => {

            const avatar =
                user.avatar_url ||
                "https://i.pravatar.cc/100?img=12";


            const username =
                escapeHTML(
                    user.username ||
                    "FREE CHAT USER"
                );


            /* =====================================
               💚 CHECK IF ALREADY FRIENDS
            ===================================== */

            const isFriend =
                friendships.some(friend =>

                    (
                        friend.user_id === currentUserId &&
                        friend.friend_id === user.id
                    )

                    ||

                    (
                        friend.friend_id === currentUserId &&
                        friend.user_id === user.id
                    )

                );


            /* =====================================
               📩 CHECK FRIEND REQUEST
            ===================================== */

            const request =
                requests.find(req =>

                    (
                        req.sender_id === currentUserId &&
                        req.receiver_id === user.id
                    )

                    ||

                    (
                        req.sender_id === user.id &&
                        req.receiver_id === currentUserId
                    )

                );


            let friendButton = "";


            /* =====================================
               💚 ALREADY FRIENDS
            ===================================== */

            if (isFriend) {

                friendButton = `
                    <button
                        type="button"
                        class="friend-status-btn friends"
                        disabled
                    >
                        ✓ Friends
                    </button>
                `;

            }


            /* =====================================
               ⏳ I SENT REQUEST
            ===================================== */

            else if (
                request &&
                request.sender_id === currentUserId &&
                request.status === "pending"
            ) {

                friendButton = `
                    <button
                        type="button"
                        class="friend-status-btn request-sent"
                        disabled
                    >
                        ⏳ Request Sent
                    </button>
                `;

            }


            /* =====================================
               📩 THEY SENT ME REQUEST
            ===================================== */

            else if (
                request &&
                request.receiver_id === currentUserId &&
                request.status === "pending"
            ) {

                friendButton = `
                    <button
                        type="button"
                        class="friend-status-btn respond"
                        onclick="
                            event.stopPropagation();
                            openNotifications();
                        "
                    >
                        📩 Respond
                    </button>
                `;

            }


            /* =====================================
               ➕ NO RELATIONSHIP
            ===================================== */

            else {

                friendButton = `
                    <button
                        type="button"
                        class="add-friend-btn"
                        onclick="
                            event.stopPropagation();
                            sendFriendRequest('${user.id}');
                        "
                    >
                        ➕ Add Friend
                    </button>
                `;

            }


            return `

                <article
                    class="user-item"
                    data-username="${username.toLowerCase()}"
                >

                    <div
                        class="user-main"
                        onclick="startChatWithUser('${user.id}')"
                    >

                        <div class="user-avatar-wrapper">

                            <img
                                src="${escapeHTML(avatar)}"
                                alt="${username}"
                                class="user-avatar"
                            >

                            ${
                                user.online
                                    ? `<span class="user-online"></span>`
                                    : ""
                            }

                        </div>


                        <div class="user-info">

                            <h3>
                                ${username}
                            </h3>

                            <p>
                                ${
                                    user.online
                                        ? "🟢 Online"
                                        : "Offline"
                                }
                            </p>

                        </div>

                    </div>


                    ${friendButton}

                </article>

            `;

        }).join("");
}

// ==========================================
// 🤝 SEND FRIEND REQUEST
// RESPECTS PRIVACY SETTINGS
// ==========================================

async function sendFriendRequest(receiverId) {

    try {

        const {
            data: {
                user
            },
            error: userError
        } = await supabaseClient.auth.getUser();

        if (userError) throw userError;

        if (!user) {
            alert("Please login first.");
            return;
        }

        if (user.id === receiverId) {
            alert("You cannot add yourself.");
            return;
        }

/* ======================================
   🚫 CHECK BLOCK STATUS
====================================== */

const blocked = await isUserBlocked(
    user.id,
    receiverId
);

if (blocked) {

    alert(
        "🚫 You cannot send a friend request to this user because one of you has blocked the other."
    );

    return;
}

        // ==========================================
        // CHECK RECEIVER PRIVACY
        // ==========================================

        const {
            data: receiverProfile,
            error: profileError
        } = await supabaseClient
            .from("profiles")
            .select(`
                id,
                username,
                friend_request_privacy
            `)
            .eq("id", receiverId)
            .single();

        if (profileError) throw profileError;


        const privacy =
            receiverProfile.friend_request_privacy || "everyone";


        // ==========================================
        // NOBODY
        // ==========================================

        if (privacy === "nobody") {

            alert(
                "🔒 This user is not accepting friend requests."
            );

            return;
        }


        // ==========================================
        // FRIENDS OF FRIENDS
        // ==========================================

        if (privacy === "friends_of_friends") {

            const isFoF =
                await areFriendsOfFriends(
                    user.id,
                    receiverId
                );

            if (!isFoF) {

                alert(
                    "🔒 This user only accepts friend requests from friends of friends."
                );

                return;
            }
        }


        // ==========================================
        // CHECK EXISTING REQUEST / FRIENDSHIP
        // ==========================================

        const {
            data: existingRequest,
            error: checkError
        } = await supabaseClient
            .from("friend_requests")
            .select(`
                id,
                sender_id,
                receiver_id,
                status
            `)
            .or(
                `and(sender_id.eq.${user.id},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${user.id})`
            )
            .maybeSingle();

        if (checkError) throw checkError;


        if (
            existingRequest &&
            existingRequest.status === "accepted"
        ) {

            alert(
                "✅ You are already friends."
            );

            return;
        }


        if (
            existingRequest &&
            existingRequest.status === "pending"
        ) {

            console.log(
                "⏳ Friend request already pending."
            );

            await loadUsers();

            return;
        }


        // ==========================================
        // CREATE FRIEND REQUEST
        // ==========================================

        const {
            data: request,
            error: requestError
        } = await supabaseClient
            .from("friend_requests")
            .insert({
                sender_id: user.id,
                receiver_id: receiverId,
                status: "pending"
            })
            .select(`
                id,
                sender_id,
                receiver_id,
                status
            `)
            .single();

        if (requestError) throw requestError;


        // ==========================================
        // CREATE NOTIFICATION
        // ==========================================

        const {
            error: notificationError
        } = await supabaseClient
            .from("notifications")
            .insert({
                user_id: receiverId,
                sender_id: user.id,
                type: "friend_request",
                message: "sent you a friend request",
                friend_request_id: request.id
            });


        if (notificationError) {

            console.error(
                "⚠️ Friend request notification error:",
                notificationError
            );
        }


        await loadUsers();


        alert(
            "✅ Friend request sent!"
        );


    } catch (error) {

        console.error(
            "❌ Friend request error:",
            error
        );

        alert(
            "Could not send friend request.\n\n" +
            (error.message || "Please try again.")
        );
    }
}


// ==========================================
// 👥 CHECK FRIENDS OF FRIENDS
// ==========================================

async function areFriendsOfFriends(
    userId,
    targetUserId
) {

    try {

        // Get my friends

        const {
            data: myFriendships,
            error: myError
        } = await supabaseClient
            .from("friendships")
            .select(`
                friend_id
            `)
            .eq("user_id", userId);

        if (myError) throw myError;


        if (
            !myFriendships ||
            myFriendships.length === 0
        ) {
            return false;
        }


        const myFriendIds =
            myFriendships.map(
                row => row.friend_id
            );


        // Check whether target is connected
        // to any of my friends

        const {
            data: connection,
            error: connectionError
        } = await supabaseClient
            .from("friendships")
            .select("id")
            .in("user_id", myFriendIds)
            .eq("friend_id", targetUserId)
            .limit(1);


        if (connectionError) {

            console.error(
                "Friends-of-friends check error:",
                connectionError
            );

            return false;
        }


        return (
            connection &&
            connection.length > 0
        );


    } catch (error) {

        console.error(
            "❌ Friends-of-friends error:",
            error
        );

        return false;
    }
}


/* ==========================================
   🔎 TOP SEARCH BUTTON
========================================== */

// 🔎 FOCUS FEED SEARCH
function focusFeedSearch() {
    const search = document.getElementById("feedSearch");

    if (!search) {
        console.error("❌ Feed search input not found.");
        return;
    }

    // Make sure the search area is visible
    search.scrollIntoView({
        behavior: "smooth",
        block: "center"
    });

    // Focus the search input
    setTimeout(() => {
        search.focus();

        // Put cursor at the end of any existing text
        if (typeof search.setSelectionRange === "function") {
            const length = search.value.length;
            search.setSelectionRange(length, length);
        }
    }, 300);
}

/* ==========================================
   👥 FRIENDS PAGE
========================================== */

let currentFriendsTab = "friends";


function openFriends() {

    console.log("👥 Opening Friends...");

    const homeScreen =
        document.getElementById("homeScreen");

    const contactsScreen =
        document.getElementById("contactsScreen");

    const friendsScreen =
        document.getElementById("friendsScreen");


    if (homeScreen) {
        homeScreen.classList.add("hidden");
    }

    if (contactsScreen) {
        contactsScreen.classList.add("hidden");
    }

    if (friendsScreen) {
        friendsScreen.classList.remove("hidden");
    }


    showFriendsTab("friends");
}


/* ==========================================
   👥 SWITCH FRIENDS TABS
========================================== */

function showFriendsTab(tab) {

    currentFriendsTab = tab;


    const tabs = [
        "friends",
        "suggestions",
        "add",
        "confirm"
    ];


    tabs.forEach(name => {

        const content =
            document.getElementById(
                name === "friends"
                    ? "friendsTab"
                    : name === "suggestions"
                    ? "suggestionsTab"
                    : name === "add"
                    ? "addFriendsTab"
                    : "confirmTab"
            );

        if (content) {
            content.classList.add("hidden");
        }


        const button =
            document.getElementById(
                name === "friends"
                    ? "friendsTabBtn"
                    : name === "suggestions"
                    ? "suggestionsTabBtn"
                    : name === "add"
                    ? "addFriendsTabBtn"
                    : "confirmTabBtn"
            );

        if (button) {
            button.classList.remove("active");
        }

    });


    const selectedContent =
        document.getElementById(
            tab === "friends"
                ? "friendsTab"
                : tab === "suggestions"
                ? "suggestionsTab"
                : tab === "add"
                ? "addFriendsTab"
                : "confirmTab"
        );


    const selectedButton =
        document.getElementById(
            tab === "friends"
                ? "friendsTabBtn"
                : tab === "suggestions"
                ? "suggestionsTabBtn"
                : tab === "add"
                ? "addFriendsTabBtn"
                : "confirmTabBtn"
        );


    if (selectedContent) {
        selectedContent.classList.remove("hidden");
    }


    if (selectedButton) {
        selectedButton.classList.add("active");
    }


    /* ======================================
       LOAD SELECTED SECTION
    ====================================== */

    if (tab === "friends") {

        loadMyFriends();

    }


    if (tab === "suggestions") {

        loadFriendSuggestions();

    }


    if (tab === "add") {

        const input =
            document.getElementById(
                "friendsSearchInput"
            );

        if (input) {
            input.focus();
        }

    }


    if (tab === "confirm") {

        loadFriendRequests();

    }

}


/* ==========================================
   👥 LOAD MY FRIENDS
========================================== */

async function loadMyFriends() {

    const list =
        document.getElementById(
            "friendsList"
        );

    if (!list) return;


    list.innerHTML = `
        <div class="friends-loading">
            Loading friends...
        </div>
    `;


    try {

        const {
            data: {
                user
            },
            error: userError
        } =
            await supabaseClient.auth.getUser();


        if (userError) throw userError;


        if (!user) {
            list.innerHTML = `
                <div class="friends-empty">
                    Please login first.
                </div>
            `;
            return;
        }


        const {
            data: friendships,
            error
        } =
            await supabaseClient
                .from("friends")
                .select(`
                    user_id,
                    friend_id
                `)
                .or(
                    `user_id.eq.${user.id},friend_id.eq.${user.id}`
                );


        if (error) throw error;


        if (
            !friendships ||
            friendships.length === 0
        ) {

            list.innerHTML = `
                <div class="friends-empty">

                    <div class="friends-empty-icon">
                        👥
                    </div>

                    <h3>
                        No friends yet
                    </h3>

                    <p>
                        Add people to start building your
                        FREE CHAT friends list.
                    </p>

                </div>
            `;

            return;
        }


        const friendIds =
            friendships.map(friend => {

                return friend.user_id === user.id
                    ? friend.friend_id
                    : friend.user_id;

            });


        const {
            data: profiles,
            error: profilesError
        } =
            await supabaseClient
                .from("profiles")
                .select(`
                    id,
                    username,
                    avatar_url,
                    online,
                    last_seen
                `)
                .in(
    "id",
    friendIds
);
                


        if (profilesError) {
            throw profilesError;
        }


        renderMyFriends(
            profiles || []
        );


    } catch (error) {

        console.error(
            "❌ Loading friends failed:",
            error
        );


        list.innerHTML = `
            <div class="friends-empty">

                ⚠️ Unable to load friends.

                <p>
                    ${escapeHTML(
                        error.message ||
                        "Please try again."
                    )}
                </p>

            </div>
        `;

    }

}


/* ==========================================
   👥 RENDER MY FRIENDS
========================================== */

function renderMyFriends(friends) {

    const list =
        document.getElementById(
            "friendsList"
        );

    if (!list) return;


    list.innerHTML =
        friends.map(friend => {

            const username =
                escapeHTML(
                    friend.username ||
                    "FREE CHAT USER"
                );


            const avatar =
                friend.avatar_url ||
                "https://i.pravatar.cc/100?img=12";


            return `

                <article
    class="friend-card"
>
                    
            

                    <div
                        class="friend-card-avatar-wrapper"
                    >

<img
    class="friend-card-avatar"
    src="${escapeHTML(avatar)}"
    alt="${username}"
    onclick="openUserProfile('${friend.id}')"
    style="cursor:pointer;"
>

                        ${
                            friend.online
                                ? `
                                    <span
                                        class="friend-card-online"
                                    ></span>
                                `
                                : ""
                        }

                    </div>


                    <div
                        class="friend-card-info"
                    >

                        <h3
    onclick="openUserProfile('${friend.id}')"
    style="cursor:pointer;"
>
    ${username}
</h3>

                        <p>
                            ${
                                friend.online
                                    ? "🟢 Online"
                                    : "Offline"
                            }
                        </p>

                    </div>


                    <div
                        class="friend-card-actions"
                    >

                        <button
                            type="button"
                            class="friend-action-btn friend-chat-btn"
                            onclick="startChatWithUser('${friend.id}')"
                        >
                            💬
                        </button>

                    </div>

                </article>

            `;

        }).join("");

}


/* ==========================================
   ✨ FRIEND SUGGESTIONS
========================================== */

async function loadFriendSuggestions() {

    const list =
        document.getElementById(
            "suggestionsList"
        );

    if (!list) return;


    list.innerHTML = `
        <div class="friends-loading">
            Loading suggestions...
        </div>
    `;


    try {

        const {
            data: {
                user
            }
        } =
            await supabaseClient.auth.getUser();


        if (!user) return;


        const {
            data: users,
            error
        } =
            await supabaseClient
                .from("profiles")
                .select(`
                    id,
                    username,
                    avatar_url,
                    online
                `)
                .neq(
                    "id",
                    user.id
                )
                .order(
                    "username",
                    {
                        ascending: true
                    }
                );


        if (error) throw error;


        /*
        ======================================
        REMOVE PEOPLE ALREADY FRIENDS
        ======================================
        */

        const {
            data: friendships
        } =
            await supabaseClient
                .from("friends")
                .select(`
                    user_id,
                    friend_id
                `)
                .or(
                    `user_id.eq.${user.id},friend_id.eq.${user.id}`
                );


        const friendIds =
            (friendships || []).map(friend => {

                return friend.user_id === user.id
                    ? friend.friend_id
                    : friend.user_id;

            });


        const suggestions =
            (users || []).filter(
                person =>
                    !friendIds.includes(
                        person.id
                    )
            );


        renderFriendSuggestions(
            suggestions
        );


    } catch (error) {

        console.error(
            "❌ Suggestions error:",
            error
        );

        list.innerHTML = `
            <div class="friends-empty">
                ⚠️ Unable to load suggestions.
            </div>
        `;

    }

}


/* ==========================================
   ✨ RENDER SUGGESTIONS
========================================== */

function renderFriendSuggestions(users) {

    const list =
        document.getElementById(
            "suggestionsList"
        );

    if (!list) return;


    if (!users.length) {

        list.innerHTML = `
            <div class="friends-empty">

                <div class="friends-empty-icon">
                    🎉
                </div>

                <h3>
                    No new suggestions
                </h3>

                <p>
                    You've already connected with everyone available.
                </p>

            </div>
        `;

        return;
    }


    list.innerHTML =
        users.map(user => {

            const username =
                escapeHTML(
                    user.username ||
                    "FREE CHAT USER"
                );


            const avatar =
                user.avatar_url ||
                "https://i.pravatar.cc/100?img=12";


            return `

                <article
                    class="friend-card"
                >

                    <div
                        class="friend-card-avatar-wrapper"
                    >

                        <img
                            class="friend-card-avatar"
                            src="${escapeHTML(avatar)}"
                            alt="${username}"
                        >

                    </div>


                    <div
                        class="friend-card-info"
                    >

                        <h3>
                            ${username}
                        </h3>

                        <p>
                            ${
                                user.online
                                    ? "🟢 Online"
                                    : "FREE CHAT member"
                            }
                        </p>

                    </div>


                    <button
                        type="button"
                        class="friend-add-btn"
                        onclick="
                            sendFriendRequest(
                                '${user.id}'
                            );
                        "
                    >
                        ➕ Add
                    </button>

                </article>

            `;

        }).join("");

}


/* ==========================================
   🤝 LOAD FRIEND REQUESTS
========================================== */

async function loadFriendRequests() {

    const list =
        document.getElementById("friendRequestsList");

    if (!list) return;

    list.innerHTML = `
        <div class="friends-loading">
            Loading requests...
        </div>
    `;

    try {

        const {
            data: { user },
            error: userError
        } = await supabaseClient.auth.getUser();

        if (userError) throw userError;

        if (!user) return;


        const {
            data: requests,
            error
        } = await supabaseClient
            .from("friend_requests")
            .select(`
                id,
                sender_id,
                receiver_id,
                status,
                created_at
            `)
            .eq("receiver_id", user.id)
            .eq("status", "pending")
            .order("created_at", {
                ascending: false
            });

        if (error) throw error;


        if (!requests || requests.length === 0) {

            list.innerHTML = `
                <div class="friends-empty">

                    <div class="friends-empty-icon">
                        📭
                    </div>

                    <h3>No friend requests</h3>

                    <p>
                        New requests will appear here.
                    </p>

                </div>
            `;

            updateFriendRequestBadge(0);

            return;
        }


        const senderIds =
            requests.map(
                request => request.sender_id
            );


        const {
            data: senders,
            error: senderError
        } = await supabaseClient
            .from("profiles")
            .select(`
                id,
                username,
                avatar_url,
                online
            `)
            .in("id", senderIds);

        if (senderError) throw senderError;


        const senderMap = {};

        (senders || []).forEach(sender => {

            senderMap[sender.id] = sender;

        });


        const requestData =
            requests.map(request => ({

                ...request,

                sender:
                    senderMap[request.sender_id] || {}

            }));


        renderFriendRequests(requestData);

        updateFriendRequestBadge(
            requests.length
        );


    } catch (error) {

        console.error(
            "❌ Friend requests error:",
            error?.message || error
        );

        list.innerHTML = `
            <div class="friends-empty">

                ⚠️ Unable to load friend requests.

                <p>
                    ${escapeHTML(
                        error?.message ||
                        "Please try again."
                    )}
                </p>

            </div>
        `;
    }
}

/* ==========================================
   🔴 FRIEND REQUEST BADGE
========================================== */

function updateFriendRequestBadge(count) {

    const badges = [
        document.getElementById("friendRequestBadge"),
        document.getElementById("friendsRequestBadge"),
        document.getElementById("friendBadge")
    ];

    badges.forEach(badge => {

        if (!badge) return;

        if (count > 0) {

            badge.textContent = count;
            badge.style.display = "flex";

        } else {

            badge.textContent = "";
            badge.style.display = "none";

        }

    });

    console.log(
        "🔴 Friend request badge:",
        count
    );
}

/* ==========================================
   🤝 RENDER REQUESTS
========================================== */

function renderFriendRequests(requests) {

    const list =
        document.getElementById(
            "friendRequestsList"
        );

    if (!list) return;


    list.innerHTML =
        requests.map(request => {

            const sender =
                request.sender || {};


            const username =
                escapeHTML(
                    sender.username ||
                    "FREE CHAT USER"
                );


            const avatar =
                sender.avatar_url ||
                "https://i.pravatar.cc/100?img=12";


            return `

                <article
                    class="friend-card"
                >

                    <div
                        class="friend-card-avatar-wrapper"
                    >

                        <img
                            class="friend-card-avatar"
                            src="${escapeHTML(avatar)}"
                            alt="${username}"
                        >

                    </div>


                    <div
                        class="friend-card-info"
                    >

                        <h3>
                            ${username}
                        </h3>

                        <p>
                            wants to be your friend
                        </p>

                    </div>


                    <div
                        class="friend-card-actions"
                    >

                        <button
                            type="button"
                            class="friend-action-btn friend-confirm-btn"
                            onclick="
                                respondToFriendRequest(
                                    '${request.id}',
                                    '${request.sender_id}',
                                    'accept'
                                );

                                setTimeout(
                                    loadFriendRequests,
                                    500
                                );
                            "
                        >
                            ✓
                        </button>


                        <button
                            type="button"
                            class="friend-action-btn friend-delete-btn"
                            onclick="
                                respondToFriendRequest(
                                    '${request.id}',
                                    '${request.sender_id}',
                                    'reject'
                                );

                                setTimeout(
                                    loadFriendRequests,
                                    500
                                );
                            "
                        >
                            ✕
                        </button>

                    </div>

                </article>

            `;

        }).join("");

}


/* =========================================================
   👥 SEND FRIEND REQUEST
========================================================= */

async function sendFriendRequest(receiverId) {

    try {

        const {
            data: {
                user
            },
            error: userError
        } = await supabaseClient.auth.getUser();


        if (userError) {
            throw userError;
        }


        if (!user) {

            alert("Please login first.");

            return;
        }


        if (user.id === receiverId) {

            alert("You cannot add yourself.");

            return;
        }
const blocked = await isUserBlocked(
    user.id,
    receiverId
);

if (blocked) {

    alert(
        "🚫 You cannot send a friend request to this user."
    );

    return;
}

        /* =====================================
           🔍 CHECK EXISTING REQUEST
        ===================================== */

        const {
            data: existingRequest,
            error: checkError
        } = await supabaseClient
            .from("friend_requests")
            .select(`
                id,
                sender_id,
                receiver_id,
                status
            `)
            .or(
                `and(sender_id.eq.${user.id},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${user.id})`
            )
            .maybeSingle();


        if (checkError) {
            throw checkError;
        }


        /* =====================================
           💚 ALREADY FRIENDS
        ===================================== */

        if (
            existingRequest &&
            existingRequest.status === "accepted"
        ) {

            alert("✅ You are already friends.");

            return;
        }


        /* =====================================
           ⏳ REQUEST ALREADY PENDING
        ===================================== */

        if (
            existingRequest &&
            existingRequest.status === "pending"
        ) {

            /*
               Don't create another request.
               The UI will show:
               ⏳ Request Sent
            */

            console.log(
                "⏳ Friend request already pending."
            );

            await loadUsers();

            return;
        }


        /* =====================================
           ➕ CREATE NEW REQUEST
        ===================================== */

        const {
            data: request,
            error: requestError
        } = await supabaseClient
            .from("friend_requests")
            .insert({
                sender_id: user.id,
                receiver_id: receiverId,
                status: "pending"
            })
            .select(`
                id,
                sender_id,
                receiver_id,
                status
            `)
            .single();


        if (requestError) {
            throw requestError;
        }


        console.log(
            "👥 Friend request created:",
            request
        );


        /* =====================================
           🔔 CREATE NOTIFICATION
        ===================================== */

        const {
            error: notificationError
        } = await supabaseClient
            .from("notifications")
            .insert({
                user_id: receiverId,
                sender_id: user.id,
                type: "friend_request",
                message: "sent you a friend request",
                friend_request_id: request.id
            });


        if (notificationError) {

            console.error(
                "⚠️ Friend request notification error:",
                notificationError
            );

        } else {

            console.log(
                "🔔 Friend request notification created"
            );

        }


        /* =====================================
           🔄 REFRESH USER LIST
        ===================================== */

        await loadUsers();


        alert(
            "✅ Friend request sent!\n\nThe request is now waiting for them to accept."
        );


    } catch (error) {

        console.error(
            "❌ Friend request error:",
            error
        );


        alert(
            "Could not send friend request.\n\n" +
            (
                error.message ||
                "Please try again."
            )
        );

    }

}

async function respondToFriendRequest(
    requestId,
    senderId,
    action
) {

    try {

        const {
            data: {
                user
            },
            error: userError
        } =
            await supabaseClient
                .auth
                .getUser();


        if (userError) {
            throw userError;
        }


        if (!user) {
            alert("Please login first.");
            return;
        }


        // 🔍 Get the request
        const {
            data: request,
            error: requestError
        } =
            await supabaseClient
                .from("friend_requests")
                .select(`
                    id,
                    sender_id,
                    receiver_id,
                    status
                `)
                .eq("id", requestId)
                .eq("receiver_id", user.id)
                .single();


        if (requestError) {
            throw requestError;
        }


        if (
            request.status !==
            "pending"
        ) {

            alert(
                "This request has already been handled."
            );

            return;
        }


        // ❌ REJECT
        if (action === "reject") {

            const {
                error
            } =
                await supabaseClient
                    .from("friend_requests")
                    .update({
                        status: "rejected"
                    })
                    .eq(
                        "id",
                        requestId
                    );


            if (error) {
                throw error;
            }


            console.log(
                "❌ Friend request rejected"
            );


            await supabaseClient
    .from("notifications")
    .update({
        read: true
    })
    .eq("user_id", user.id)
    .eq("sender_id", senderId)
    .eq("type", "friend_request")
    .eq("message", "sent you a friend request");

await loadNotifications();
await loadFriendRequests();

return;
        }


        // =====================================
        // ✅ ACCEPT FRIEND REQUEST
        // =====================================

        const {
            error: updateError
        } =
            await supabaseClient
                .from("friend_requests")
                .update({
                    status: "accepted"
                })
                .eq(
                    "id",
                    requestId
                );


        if (updateError) {
            throw updateError;
        }


        // 👥 Create friendship
        const {
            error: friendshipError
        } =
            await supabaseClient
                .from("friends")
                .insert([

                    {
                        user_id:
                            user.id,

                        friend_id:
                            senderId
                    },

                    {
                        user_id:
                            senderId,

                        friend_id:
                            user.id
                    }

                ]);


        if (friendshipError) {
            throw friendshipError;
        }


        // 🔔 Notify sender
        try {

            const {
                error: notificationError
            } =
                await supabaseClient
                    .from("notifications")
                    .insert({

                        user_id:
                            senderId,

                        sender_id:
                            user.id,

                        type:
                            "friend_request",

                        message:
                            "accepted your friend request"

                    });


            if (notificationError) {
                throw notificationError;
            }


        } catch (
            notificationError
        ) {

            console.error(
                "⚠️ Accept notification error:",
                notificationError
            );

        }


// 🔔 Mark friend request notification as read
await supabaseClient
    .from("notifications")
    .update({
        read: true
    })
    .eq("user_id", user.id)
    .eq("sender_id", senderId)
    .eq("type", "friend_request")
    .eq("message", "sent you a friend request");

alert(
    "🎉 You are now friends!"
);

await loadNotifications();
await loadFriendRequests();
await loadMyFriends();


    } catch (error) {

        console.error(
            "❌ Friend request response error:",
            error
        );


        alert(
            "Could not process request.\n\n" +
            (
                error.message ||
                "Please try again."
            )
        );
    }
}

/* =========================================================
   SEARCH USERS
========================================================= */

function searchUsers() {

    const input =
        document.getElementById(
            "userSearchInput"
        );

    const usersList =
        document.getElementById(
            "usersList"
        );


    if (!input || !usersList) {
        return;
    }


    const search =
        input.value
            .toLowerCase()
            .trim();


    const users =
        usersList.querySelectorAll(
            ".user-item"
        );


    let found = false;


    users.forEach(user => {

        const username =
            user.dataset.username ||
            "";


        if (
            username.includes(search)
        ) {

            user.style.display =
                "flex";

            found = true;

        } else {

            user.style.display =
                "none";
        }

    });


    let emptySearch =
        document.getElementById(
            "emptyUserSearch"
        );


    if (!found && search) {

        if (!emptySearch) {

            emptySearch =
                document.createElement(
                    "div"
                );

            emptySearch.id =
                "emptyUserSearch";

            emptySearch.className =
                "users-empty";

            usersList.appendChild(
                emptySearch
            );
        }


        emptySearch.innerHTML = `

            <div>🔍</div>

            <h3>
                No user found
            </h3>

            <p>
                Try another username.
            </p>

        `;

        emptySearch.style.display =
            "block";

    } else if (emptySearch) {

        emptySearch.style.display =
            "none";
    }
}


// ==========================================
// 👥 CHECK FRIENDSHIP
// ==========================================

async function checkIfFriends(
    userId,
    otherUserId
) {

    try {

        const {
            data,
            error
        } = await supabaseClient
            .from("friends")
            .select("id")
            .eq("user_id", userId)
            .eq("friend_id", otherUserId)
            .maybeSingle();

        if (error) throw error;

        return !!data;

    } catch (error) {

        console.error(
            "❌ Friendship check error:",
            error
        );

        return false;
    }
}

/* ==========================================
   🚫 CHECK IF USERS ARE BLOCKED
========================================== */

async function isUserBlocked(userA, userB) {

    try {

        const { data, error } = await supabaseClient
            .from("blocked_users")
            .select("id")
            .or(
                `and(blocker_id.eq.${userA},blocked_id.eq.${userB}),and(blocker_id.eq.${userB},blocked_id.eq.${userA})`
            )
            .maybeSingle();

        if (error) throw error;

        return !!data;

    } catch (error) {

        console.error(
            "❌ Block check error:",
            error
        );

        return false;
    }
}


/* ==========================================
   🔒 CHECK IF USER CAN BE MESSAGED
========================================== */

async function canMessageUser(targetUserId) {

    try {

        /* ======================================
           👤 CURRENT USER
        ====================================== */

        const {
            data: { user: currentUser },
            error: userError
        } = await supabaseClient.auth.getUser();

        if (userError) {
            throw userError;
        }

        if (!currentUser) {

            return {
                allowed: false,
                reason: "Please login first."
            };

        }


        /* ======================================
           🚫 BLOCK CHECK
        ====================================== */

        const blocked = await isUserBlocked(
            currentUser.id,
            targetUserId
        );

        if (blocked) {

            return {
                allowed: false,
                reason:
                    "🚫 You cannot message this user because one of you has blocked the other."
            };

        }


        /* ======================================
           👤 LOAD TARGET PROFILE
        ====================================== */

        const {
            data: targetProfile,
            error: profileError
        } = await supabaseClient
            .from("profiles")
            .select(`
                id,
                username,
                message_privacy
            `)
            .eq("id", targetUserId)
            .single();

        if (profileError) {
            throw profileError;
        }

        if (!targetProfile) {

            return {
                allowed: false,
                reason: "User profile not found."
            };

        }


        /* ======================================
           🔐 MESSAGE PRIVACY
        ====================================== */

        const privacy =
            targetProfile.message_privacy || "everyone";


        /* ======================================
           🌍 EVERYONE
        ====================================== */

        if (privacy === "everyone") {

            return {
                allowed: true
            };

        }


        /* ======================================
           🚫 NOBODY
        ====================================== */

        if (privacy === "nobody") {

            return {
                allowed: false,
                reason:
                    `🔒 ${targetProfile.username || "This user"} does not allow new messages.`
            };

        }

/* ======================================
   👥 FRIENDS ONLY
====================================== */

if (privacy === "friends") {

    const areFriends = await checkIfFriends(
        currentUser.id,
        targetUserId
    );

    if (!areFriends) {

        return {
            allowed: false,
            reason:
                "🔒 This user only allows friends to send messages."
        };

    }

    return {
        allowed: true
    };
}


        /* ======================================
           ✅ DEFAULT
        ====================================== */

        return {
            allowed: true
        };

    } catch (error) {

        console.error(
            "❌ Message permission error:",
            error
        );

        return {
            allowed: false,
            reason:
                "Unable to check message permissions. Please try again."
        };

    }
}

/* =========================================================
   💬 OPEN REAL CHAT
========================================================= */

async function startChatWithUser(userId) {

    console.log("💬 Opening chat with:", userId);

    try {

        /* =====================================
           CHECK CURRENT USER
        ===================================== */

        const {
            data: {
                user: currentUser
            },
            error: authError
        } =
            await supabaseClient.auth.getUser();

        if (authError) {
            throw authError;
        }

        if (!currentUser) {

            alert("Please login first.");

            return;
        }

currentUserId = currentUser.id;

    /* =====================================
   🔐 CHECK MESSAGE PRIVACY
===================================== */

const messagePermission =
    await canMessageUser(userId);


if (!messagePermission.allowed) {

    alert(
        "🔒 Message unavailable\n\n" +
        messagePermission.reason
    );

    return;
}

        /* =====================================
           SAVE CHAT USER
        ===================================== */

        currentChatUserId =
            userId;


        /* =====================================
           LOAD OTHER USER
        ===================================== */

        const {
            data: otherUser,
            error: userError
        } =
            await supabaseClient
                .from("profiles")
                .select(`
                    id,
                    username,
                    avatar_url,
                    online,
                    last_seen
                `)
                .eq("id", userId)
                .single();

        if (userError) {
            throw userError;
        }

        currentChatUser =
            otherUser;



        /* =====================================
           FIND EXISTING CONVERSATION
        ===================================== */

        const {
            data: conversations,
            error: findError
        } =
            await supabaseClient
                .from("conversations")
                .select("*")
                .or(
                    `and(user_one.eq.${currentUser.id},user_two.eq.${userId}),and(user_one.eq.${userId},user_two.eq.${currentUser.id})`
                )
                .limit(1);

        if (findError) {
            throw findError;
        }


        /* =====================================
           CREATE CONVERSATION IF NEEDED
        ===================================== */

        if (
            !conversations ||
            conversations.length === 0
        ) {

            console.log(
                "🆕 Creating conversation..."
            );

            const {
                data: newConversation,
                error: createError
            } =
                await supabaseClient
                    .from("conversations")
                    .insert({

                        user_one:
                            currentUser.id,

                        user_two:
                            userId

                    })
                    .select()
                    .single();

            if (createError) {
                throw createError;
            }

            currentConversationId =
                newConversation.id;

        } else {

            currentConversationId =
                conversations[0].id;
        }


        console.log(
            "✅ Conversation:",
            currentConversationId
        );


        /* =====================================
           UPDATE CHAT HEADER
        ===================================== */

        const chatUsername =
            document.getElementById(
                "chatUsername"
            );

        const chatAvatar =
            document.getElementById(
                "chatAvatar"
            );

        if (chatUsername) {

            chatUsername.textContent =
                otherUser.username ||
                "FREE CHAT USER";
        }

        if (chatAvatar) {

            chatAvatar.src =
                otherUser.avatar_url ||
                "https://i.pravatar.cc/100?img=12";
        }


        const status =
            document.querySelector(
                ".chat-header-info span"
            );

        if (status) {

            status.textContent =
                otherUser.online
                    ? "🟢 Online"
                    : "Offline";
        }


        /* =====================================
           HIDE OTHER SCREENS
        ===================================== */

        const home =
            document.getElementById(
                "homeScreen"
            );

        const contacts =
            document.getElementById(
                "contactsScreen"
            );

        const friends =
            document.getElementById(
                "friendsScreen"
            );

        const notifications =
            document.getElementById(
                "notificationsScreen"
            );

        const chat =
            document.getElementById(
                "chatScreen"
            );


        if (home) {
            home.classList.add("hidden");
        }

        if (contacts) {
            contacts.classList.add("hidden");
        }

        if (friends) {
            friends.classList.add("hidden");
        }

        if (notifications) {
            notifications.classList.add("hidden");
        }

        if (chat) {
            chat.classList.remove("hidden");
        }


        /* =====================================
           LOAD MESSAGES
        ===================================== */

        await loadMessages();


/* =====================================
   START REALTIME
===================================== */

subscribeToMessages();


/* =====================================
   START TYPING INDICATOR
===================================== */

await setupTypingIndicator();

setupTypingInput();


await refreshChatMenus();

        /* =====================================
           FOCUS MESSAGE INPUT
        ===================================== */

        const input =
            document.getElementById(
                "messageInput"
            );

        if (input) {

            setTimeout(() => {

                input.focus();

            }, 300);
        }


        console.log(
            "🎉 Chat opened successfully!"
        );

    } catch (error) {

        console.error(
            "❌ Chat opening error:",
            error
        );

        alert(
            "Unable to open chat.\n\n" +
            (error.message ||
                "Please try again.")
        );
    }
}

/* =========================================================
   LOAD MESSAGES
========================================================= */

async function loadMessages() {

    const container = document.getElementById("messagesContainer");

    if (!container) {
        console.error("❌ messagesContainer not found.");
        return;
    }

    if (!currentConversationId) {
        console.error("❌ No current conversation.");
        return;
    }

    container.innerHTML = `
        <div class="messages-loading">
            Loading messages...
        </div>
    `;

    try {

        const {
            data: { user: currentUser },
            error: authError
        } = await supabaseClient.auth.getUser();

        if (authError) throw authError;

        if (!currentUser) {
            console.error("❌ No logged-in user.");
            return;
        }

        currentUserId = currentUser.id;

        /* GET MESSAGES */

        const {
            data: messages,
            error
        } = await supabaseClient
            .from("messages")
            .select(`
                id,
                conversation_id,
                sender_id,
                receiver_id,
                content,
                created_at,
                seen,
                read_at,
                delivered,
                message_type,
                media_url,
                file_name,
                file_size,
                mime_type,
                poll_id,
                contact_id
            `)
            .eq("conversation_id", currentConversationId)
            .order("created_at", {
                ascending: true
            });

        if (error) throw error;

        console.log(
            "💬 Messages loaded:",
            messages?.length || 0
        );

        console.log(
            "📊 Poll messages:",
            (messages || []).filter(
                message => message.message_type === "poll"
            )
        );

        console.log(
            "📎 Media messages:",
            (messages || []).filter(
                message =>
                    message.message_type &&
                    message.message_type !== "text"
            )
        );

        /* RENDER MESSAGES */

        renderMessages(
            messages || [],
            currentUser.id
        );

        /* MARK INCOMING MESSAGES AS DELIVERED */

        await markMessagesAsDelivered();

        /* MARK INCOMING MESSAGES AS READ */

        await markMessagesAsRead();

    } catch (error) {

        console.error("❌ Load messages error:", error);

        container.innerHTML = `
            <div class="messages-loading">
                ⚠️ Unable to load messages.
                <br><br>
                ${escapeHTML(
                    error.message || "Please try again."
                )}
            </div>
        `;
    }

} // END loadMessages()


/* =========================================================
   MARK INCOMING MESSAGES AS DELIVERED
========================================================= */

async function markMessagesAsDelivered() {

    if (!currentConversationId || !currentUserId) {
        return;
    }

    try {

        const { error } = await supabaseClient
            .from("messages")
            .update({
                delivered: true
            })
            .eq("conversation_id", currentConversationId)
            .eq("receiver_id", currentUserId)
            .eq("delivered", false);

        if (error) throw error;

        console.log(
            "✓✓ Incoming messages marked as delivered."
        );

    } catch (error) {

        console.error(
            "❌ Mark delivered error:",
            error
        );
    }
}


/* =========================================================
   MARK INCOMING MESSAGES AS READ
========================================================= */

async function markMessagesAsRead() {

    if (!currentConversationId || !currentUserId) {
        return;
    }

    try {

        const { error } = await supabaseClient
            .from("messages")
            .update({
                seen: true,
                read_at: new Date().toISOString()
            })
            .eq("conversation_id", currentConversationId)
            .eq("receiver_id", currentUserId)
            .eq("seen", false);

        if (error) throw error;

        console.log(
            "✓✓ Incoming messages marked as read."
        );

    } catch (error) {

        console.error(
            "❌ Mark read error:",
            error
        );
    }
}

/* =========================================================
   RENDER MESSAGES
========================================================= */

function renderMessages(messages) {

    const container =
        document.getElementById("messagesContainer");

    if (!container) {
        console.error(
            "❌ messagesContainer not found."
        );
        return;
    }

    if (!messages || messages.length === 0) {

        container.innerHTML = `
            <div class="no-messages" id="noMessages">
                <div>💬</div>
                <h3>No messages yet</h3>
                <p>Say hello 👋</p>
            </div>
        `;

        return;
    }


    container.innerHTML = messages.map(message => {

        const isMine =
            message.sender_id === currentUserId;

        const type =
            message.message_type || "text";


        const time =
            typeof formatMessageTime === "function"
                ? formatMessageTime(
                    message.created_at
                )
                : new Date(
                    message.created_at
                ).toLocaleTimeString(
                    [],
                    {
                        hour: "2-digit",
                        minute: "2-digit"
                    }
                );


        const safeContent =
            escapeHTML(
                message.content || ""
            );


        const safeFileName =
            escapeHTML(
                message.file_name ||
                message.content ||
                "File"
            );


        let messageContent = "";


        /* =================================================
           💬 TEXT
        ================================================= */

        if (type === "text") {

            messageContent = `

                <div class="chat-text-message">
                    ${safeContent}
                </div>

            `;
        }


        /* =================================================
           🖼️ IMAGE
        ================================================= */

        else if (type === "image") {

            messageContent = `

                <div class="chat-media-message">

                    <img
                        src="${escapeHTML(
                            message.media_url || ""
                        )}"
                        class="chat-image-message"
                        alt="${safeFileName}"
                        onclick="openChatMedia('${escapeHTML(
                            message.media_url || ""
                        )}')"
                    >

                    ${
                        message.file_name
                            ? `
                                <div class="chat-file-name">
                                    ${safeFileName}
                                </div>
                              `
                            : ""
                    }

                </div>

            `;
        }


        /* =================================================
           🎥 VIDEO
        ================================================= */

        else if (type === "video") {

            messageContent = `

                <div class="chat-media-message">

                    <video
                        class="chat-video-message"
                        controls
                        playsinline
                        preload="metadata"
                    >

                        <source
                            src="${escapeHTML(
                                message.media_url || ""
                            )}"
                            type="${escapeHTML(
                                message.mime_type ||
                                "video/mp4"
                            )}"
                        >

                        Your browser does not support
                        video playback.

                    </video>


                    ${
                        message.file_name
                            ? `
                                <div class="chat-file-name">
                                    ${safeFileName}
                                </div>
                              `
                            : ""
                    }

                </div>

            `;
        }


        /* =================================================
           🎵 AUDIO
        ================================================= */

        else if (type === "audio") {

            messageContent = `

                <div class="chat-audio-message private-audio-player">
                    <audio class="private-audio-source" preload="metadata"
                        src="${escapeHTML(message.media_url || "")}"
                        onloadedmetadata="window.updatePrivateAudio(this)"
                        ontimeupdate="window.updatePrivateAudio(this)"
                        onended="window.finishPrivateAudio(this)">
                        Your browser does not support audio playback.
                    </audio>
                    <button type="button" class="private-audio-play" aria-label="Play voice message"
                        onclick="window.togglePrivateAudio(this)">▶</button>
                    <div class="private-audio-track">
                        <div class="private-audio-wave" role="slider" tabindex="0" aria-label="Seek voice message"
                            onclick="window.seekPrivateAudio(event,this)">
                            ${Array.from({length:28},(_,i)=>`<i style="height:${[7,12,9,16,11,18,8,14,10,17,6,13,18,9,15,7,12,17,10,14,8,18,11,6,15,9,13,16][i]}px"></i>`).join('')}
                        </div>
                        <div class="private-audio-meta"><span class="private-audio-current">0:00</span><span class="private-audio-duration">0:00</span></div>
                    </div>
                    <button type="button" class="private-audio-speed" aria-label="Playback speed"
                        onclick="window.cyclePrivateAudioSpeed(this)">1×</button>
                </div>

            `;
        }


        /* =================================================
           📄 DOCUMENT
        ================================================= */

        else if (type === "document") {

            const fileSize =
                message.file_size
                    ? formatFileSize(
                        message.file_size
                    )
                    : "";


            messageContent = `

                <a
                    href="${escapeHTML(
                        message.media_url || "#"
                    )}"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="chat-document-message"
                >

                    <div class="chat-document-icon">
                        📄
                    </div>


                    <div class="chat-document-info">

                        <strong>
                            ${safeFileName}
                        </strong>

                        ${
                            fileSize
                                ? `
                                    <small>
                                        ${fileSize}
                                    </small>
                                  `
                                : ""
                        }

                    </div>


                    <div class="chat-document-download">
                        ⬇️
                    </div>

                </a>

            `;
        }


        /* =================================================
           📊 POLL
        ================================================= */

        else if (type === "poll") {

            messageContent = `

                <div
                    class="chat-poll-card"
                    data-poll-id="${escapeHTML(
                        message.poll_id ||
                        ""
                    )}"
                >

                    <div class="chat-poll-header">

                        <div class="chat-poll-icon">
                            📊
                        </div>

                        <div>

                            <div class="chat-poll-title">
                                Poll
                            </div>

                            <div class="chat-poll-subtitle">
                                Choose an option
                            </div>

                        </div>

                    </div>


                    <div class="chat-poll-question">
                        ${safeContent}
                    </div>


                    <div
                        class="chat-poll-options"
                        id="pollOptions-${
                            escapeHTML(
                                message.poll_id || ""
                            )
                        }"
                    >

                        <div class="poll-loading">
                            Loading options...
                        </div>

                    </div>


                    <div class="chat-poll-footer">

                        <span>
                            🗳️ Tap an option to vote
                        </span>

                    </div>

                </div>

            `;
        }


        /* =================================================
           👤 CONTACT
        ================================================= */
else if (type === "contact") {

    messageContent = `

        <div class="chat-contact-message">

            <div
                class="chat-contact-avatar"
                id="shared-contact-avatar-${escapeHTML(
                    message.id || ""
                )}"
            >
                👤
            </div>


            <div class="chat-contact-info">

                <strong>
                    ${safeContent}
                </strong>

                <small>
                    FREE CHAT Contact
                </small>

                <button
                    type="button"
                    class="chat-contact-view-button"
                    onclick="openSharedContact(
                        '${escapeHTML(
                            message.contact_id || ""
                        )}'
                    )"
                >
                    View Profile
                </button>

            </div>

        </div>

    `;

}

        /* =================================================
           🔄 FALLBACK
        ================================================= */

        else {

            messageContent = `

                <div class="chat-text-message">
                    ${safeContent}
                </div>

            `;
        }


        return `

            <div
                class="chat-message ${
                    isMine
                        ? "sent"
                        : "received"
                }"
                data-message-id="${escapeHTML(
                    message.id || ""
                )}"
            >

                <div class="chat-message-bubble">

                    ${messageContent}


<div class="chat-message-meta">

    <span>
        ${time}
    </span>

    ${
        isMine
            ? `
                <span
                    class="chat-message-check ${
                        message.seen
                            ? "seen"
                            : message.delivered
                                ? "delivered"
                                : "sent"
                    }"
                >
                    ${
                        message.seen
                            ? "✓✓"
                            : message.delivered
                                ? "✓✓"
                                : "✓"
                    }
                </span>
              `
            : ""
    }

</div>     
                   </div>

            </div>

        `;

    }).join("");
    
    /* =================================================
   👤 LOAD SHARED CONTACTS
================================================= */

const contactMessages =
    messages.filter(
        message =>
            message.message_type ===
            "contact"
    );


contactMessages.forEach(
    message => {

        if (message.contact_id) {

            loadSharedContact(
                message.contact_id,
                message.id
            );

        }

    }
);

/* =====================================================
   👤 LOAD SHARED CONTACT
===================================================== */

async function loadSharedContact(
    contactId,
    messageId
) {

    if (!contactId || !messageId)
        return;


    const avatar =
        document.getElementById(
            `shared-contact-avatar-${messageId}`
        );


    try {

        const {
            data: contact,
            error
        } =
            await supabaseClient
                .from("profiles")
                .select(`
                    id,
                    username,
                    avatar_url
                `)
                .eq(
                    "id",
                    contactId
                )
                .single();


        if (error)
            throw error;


        if (
            avatar &&
            contact?.avatar_url
        ) {

            avatar.innerHTML = `

                <img
                    src="${escapeHTML(
                        contact.avatar_url
                    )}"
                    alt="${escapeHTML(
                        contact.username ||
                        "Contact"
                    )}"
                >

            `;

        }

    } catch (error) {

        console.error(
            "❌ Shared contact loading error:",
            error
        );

    }
}
/* =====================================================
   👤 OPEN SHARED CONTACT
===================================================== */

function openSharedContact(contactId) {

    if (!contactId) {

        alert(
            "This contact is unavailable."
        );

        return;
    }


    closeContactPicker();


    if (
        typeof openUserProfile ===
        "function"
    ) {

        openUserProfile(
            contactId
        );

        return;
    }


    if (
        typeof showUserProfile ===
        "function"
    ) {

        showUserProfile(
            contactId
        );

        return;
    }


    console.log(
        "👤 Shared contact:",
        contactId
    );
}
    
        /* =================================================
       📊 LOAD POLLS
    ================================================= */

    const pollMessages =
        messages.filter(
            message =>
                message.message_type ===
                "poll"
        );


    pollMessages.forEach(
        message => {

            if (message.poll_id) {

                loadPollOptions(
                    message.poll_id
                );

            }

        }
    );


    /* =================================================
       📜 SCROLL TO LATEST
    ================================================= */

    requestAnimationFrame(() => {

        container.scrollTop =
            container.scrollHeight;

    });

}

/* =====================================================
   📊 LOAD POLL OPTIONS
===================================================== */

async function loadPollOptions(pollId) {

    console.log("📊 Loading poll:", pollId);

    if (!pollId) {
        console.error("❌ No poll ID supplied.");
        return;
    }

    const container =
        document.getElementById(
            `pollOptions-${pollId}`
        );

    if (!container) {
        console.error(
            "❌ Poll options container not found:",
            pollId
        );
        return;
    }

    try {

        /* ---------------------------------------------
           GET OPTIONS
        --------------------------------------------- */

        const {
            data: options,
            error: optionsError
        } =
            await supabaseClient
                .from("chat_poll_options")
                .select(
                    "id, poll_id, option_text, created_at"
                )
                .eq("poll_id", pollId)
                .order("created_at", {
                    ascending: true
                });


        if (optionsError) {

            console.error(
                "❌ Poll options error:",
                optionsError
            );

            throw optionsError;
        }


        console.log(
            "✅ Poll options:",
            options
        );


        /* ---------------------------------------------
           GET VOTES
        --------------------------------------------- */

        const {
            data: votes,
            error: votesError
        } =
            await supabaseClient
                .from("chat_poll_votes")
                .select(
                    "id, poll_id, option_id, user_id"
                )
                .eq("poll_id", pollId);


        if (votesError) {

            console.error(
                "❌ Poll votes error:",
                votesError
            );

            throw votesError;
        }


        console.log(
            "🗳️ Poll votes:",
            votes
        );


        const allVotes =
            votes || [];


        const totalVotes =
            allVotes.length;


        /* ---------------------------------------------
           CURRENT USER
        --------------------------------------------- */

        const {
            data: {
                user
            }
        } =
            await supabaseClient
                .auth
                .getUser();


        const myVote =
            allVotes.find(
                vote =>
                    vote.user_id ===
                    user?.id
            );


        /* ---------------------------------------------
           NO OPTIONS
        --------------------------------------------- */

        if (
            !options ||
            options.length === 0
        ) {

            container.innerHTML = `

                <div class="poll-loading">

                    ⚠️ No poll options found.

                </div>

            `;

            console.warn(
                "⚠️ No options found for poll:",
                pollId
            );

            return;
        }


        /* ---------------------------------------------
           RENDER OPTIONS
        --------------------------------------------- */

        container.innerHTML =
            options.map(option => {

                const optionVotes =
                    allVotes.filter(
                        vote =>
                            vote.option_id ===
                            option.id
                    ).length;


                const percentage =
                    totalVotes > 0
                        ? Math.round(
                            (
                                optionVotes /
                                totalVotes
                            ) * 100
                        )
                        : 0;


                const selected =
                    myVote?.option_id ===
                    option.id;


                return `

                    <button
                        type="button"
                        class="chat-poll-option ${
                            selected
                                ? "selected"
                                : ""
                        }"
                        onclick="voteOnPoll(
                            '${pollId}',
                            '${option.id}'
                        )"
                    >

                        <div
                            class="poll-option-progress"
                            style="width:${percentage}%"
                        ></div>


                        <div
                            class="poll-option-content"
                        >

                            <span
                                class="poll-option-text"
                            >
                                ${escapeHTML(
                                    option.option_text
                                )}
                            </span>


                            <span
                                class="poll-option-votes"
                            >
                                ${optionVotes}
                            </span>

                        </div>


                        ${
                            selected
                                ? `
                                    <span
                                        class="poll-selected-check"
                                    >
                                        ✓
                                    </span>
                                  `
                                : ""
                        }

                    </button>

                `;

            }).join("");


        /* ---------------------------------------------
           UPDATE FOOTER
        --------------------------------------------- */

        const footer =
            container
                .closest(
                    ".chat-poll-card"
                )
                ?.querySelector(
                    ".chat-poll-footer"
                );


        if (footer) {

            footer.innerHTML = `

                <span>

                    🗳️ ${totalVotes}

                    ${
                        totalVotes === 1
                            ? "vote"
                            : "votes"
                    }

                </span>


                ${
                    myVote
                        ? `
                            <span
                                class="poll-voted-label"
                            >
                                ✓ You voted
                            </span>
                          `
                        : `
                            <span>
                                Tap an option to vote
                            </span>
                          `
                }

            `;
        }


        console.log(
            "✅ Poll rendered successfully:",
            pollId
        );

    } catch (error) {

        console.error(
            "❌ Complete poll loading error:",
            error
        );


        container.innerHTML = `

            <div class="poll-loading">

                ⚠️ Could not load poll options.

            </div>

        `;
    }
}

/* =====================================================
   🗳️ VOTE ON POLL
===================================================== */

async function voteOnPoll(
    pollId,
    optionId
) {

    if (!pollId || !optionId)
        return;


    try {

        const {
            data: { user },
            error: authError
        } =
            await supabaseClient
                .auth
                .getUser();


        if (authError)
            throw authError;


        if (!user) {

            alert(
                "Please login first."
            );

            return;
        }


        /* ---------------------------------------------
           Check whether user already voted
        --------------------------------------------- */

        const {
            data: existingVote,
            error: existingError
        } =
            await supabaseClient
                .from("chat_poll_votes")
                .select("id")
                .eq("poll_id", pollId)
                .eq("user_id", user.id)
                .maybeSingle();


        if (existingError)
            throw existingError;


        if (existingVote) {

            alert(
                "You have already voted in this poll."
            );

            return;
        }


        /* ---------------------------------------------
           Save vote
        --------------------------------------------- */

        const {
            error: voteError
        } =
            await supabaseClient
                .from("chat_poll_votes")
                .insert({

                    poll_id:
                        pollId,

                    option_id:
                        optionId,

                    user_id:
                        user.id

                });


        if (voteError) {

            // Handles duplicate vote
            if (
                voteError.code ===
                "23505"
            ) {

                alert(
                    "You have already voted in this poll."
                );

                return;
            }

            throw voteError;
        }


        console.log(
            "🗳️ Vote saved!"
        );


        /* ---------------------------------------------
           Refresh poll
        --------------------------------------------- */

        await loadPollOptions(
            pollId
        );


    } catch (error) {

        console.error(
            "❌ Poll vote error:",
            error
        );

        alert(
            "Could not save your vote.\n\n" +
            (
                error.message ||
                "Please try again."
            )
        );
    }
}




/* =========================================================
   CHAT STICKER PICKER (uses existing text-message storage)
========================================================= */
function toggleChatStickerPicker(target = "private") {
    const id = target === "community" ? "communityStickerPicker" : "privateStickerPicker";
    const picker = document.getElementById(id);
    if (!picker) {
        console.warn("[Stickers] Picker element not found:", id);
        return;
    }
    picker.classList.toggle("hidden");
}

function sendChatSticker(sticker, target = "private") {
    const pickerId = target === "community" ? "communityStickerPicker" : "privateStickerPicker";
    const picker = document.getElementById(pickerId);
    if (picker) picker.classList.add("hidden");

    if (target === "community") {
        const input = document.getElementById("communityChatInput");
        const form = document.getElementById("communityChatForm");
        if (!input || !form) {
            console.warn("[Stickers] Community chat composer not found.");
            return;
        }
        input.value = sticker;
        if (typeof form.requestSubmit === "function") {
            form.requestSubmit();
        } else {
            form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        }
        return;
    }

    const input = document.getElementById("messageInput");
    const form = document.getElementById("messageForm");
    if (!input || !form) {
        console.warn("[Stickers] Private chat composer not found.");
        return;
    }
    input.value = sticker;
    if (typeof form.requestSubmit === "function") {
        form.requestSubmit();
    } else {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    }
}

/* =========================================================
   SEND MESSAGE
========================================================= */

async function sendMessage(event) {

    // IMPORTANT:
    // Stop the form from refreshing/reloading the page
    if (event) {
        event.preventDefault();
    }


    const input =
        document.getElementById("messageInput");


    if (!input) {

        console.error(
            "❌ messageInput not found."
        );

        return;
    }


    const content =
        input.value.trim();


    if (!content) {
        return;
    }


    if (!currentConversationId) {

        console.error(
            "❌ No conversation selected."
        );

        return;
    }
    /* =====================================
   🔐 CHECK MESSAGE PRIVACY
===================================== */

if (!currentChatUserId) {

    console.error(
        "❌ No chat user selected."
    );

    return;
}


const messagePermission =
    await canMessageUser(
        currentChatUserId
    );


if (!messagePermission.allowed) {

    alert(
        "🔒 Message unavailable\n\n" +
        messagePermission.reason
    );

    return;
}

    try {

        const {
            data: {
                user: currentUser
            }
        } =
            await supabaseClient.auth
                .getUser();


        if (!currentUser) {

            alert(
                "Please login again."
            );

            return;
        }


        input.disabled = true;


        console.log(
            "📤 Sending message..."
        );


        const {
            data,
            error
        } =
            await supabaseClient
                .from("messages")
                .insert({

                    conversation_id:
                        currentConversationId,

                    sender_id:
                        currentUser.id,

                    receiver_id:
                        currentChatUserId,

                    content:
                        content,

                    seen: false

                })
                .select()
                .single();


        if (error) {
            throw error;
        }


        console.log(
            "✅ Message sent:",
            data
        );


        // Clear input
        input.value = "";


        // Stay inside the chat
        await loadMessages();


    } catch (error) {

        console.error(
            "❌ Send message error:",
            error
        );


        alert(
            "Message could not be sent.\n\n" +
            error.message
        );


    } finally {

        input.disabled = false;

        input.focus();

    }

}

/* =========================================================
   💬 CLOSE REAL CHAT
========================================================= */

function closeRealChat() {

    console.log("💬 Closing real chat...");


    /* Stop realtime messages */

    if (
        typeof messagesChannel !== "undefined" &&
        messagesChannel
    ) {

        supabaseClient.removeChannel(
            messagesChannel
        );

        messagesChannel = null;
    }


    /* Reset chat state */

    currentConversationId = null;
    currentChatUserId = null;

    if (
        typeof currentChatUser !== "undefined"
    ) {
        currentChatUser = null;
    }


    /* Hide chat */

    const chat =
        document.getElementById("chatScreen");

    if (chat) {
        chat.classList.add("hidden");
    }


    /* Hide other screens */

    const contacts =
        document.getElementById("contactsScreen");

    const friends =
        document.getElementById("friendsScreen");

    const notifications =
        document.getElementById("notificationsScreen");

    if (contacts) {
        contacts.classList.add("hidden");
    }

    if (friends) {
        friends.classList.add("hidden");
    }

    if (notifications) {
        notifications.classList.add("hidden");
    }


    /* Return to home */

    const home =
        document.getElementById("homeScreen");

    if (home) {
        home.classList.remove("hidden");
    }


    console.log("🏠 Real chat closed.");
}

/* ==========================================
   ☰ FREE CHAT MAIN MENU
========================================== */

function openMainMenu() {

    console.log("☰ Opening FREE CHAT Menu...");

    const home = document.getElementById("homeScreen");
    const contacts = document.getElementById("contactsScreen");
    const friends = document.getElementById("friendsScreen");
    const chat = document.getElementById("chatScreen");
    const notifications =
        document.getElementById("notificationsScreen");
    const settings =
        document.getElementById("settingsScreen");
    const editProfile =
        document.getElementById("editProfileScreen");
    const menu =
        document.getElementById("mainMenuScreen");


    if (!menu) {

        console.error(
            "❌ mainMenuScreen not found."
        );

        return;
    }


    if (home) home.classList.add("hidden");

    if (contacts) contacts.classList.add("hidden");

    if (friends) friends.classList.add("hidden");

    if (chat) chat.classList.add("hidden");

    if (notifications) notifications.classList.add("hidden");

    if (settings) settings.classList.add("hidden");

    if (editProfile) editProfile.classList.add("hidden");


    menu.classList.remove("hidden");


    if (typeof loadMenuProfile === "function") {

        loadMenuProfile();

    }

}


function closeMainMenu() {

    const menu =
        document.getElementById("mainMenuScreen");

    const home =
        document.getElementById("homeScreen");


    if (menu) {

        menu.classList.add("hidden");

    }


    if (home) {

        home.classList.remove("hidden");

    }


    console.log("🏠 FREE CHAT Menu closed.");

}

/* =========================================================
   👤 OPEN PROFILE FROM MAIN MENU
========================================================= */

function openProfileFromMenu() {

    console.log("👤 Opening profile from main menu...");

    // Close main menu
    const menu =
        document.getElementById("mainMenuScreen");

    if (menu) {
        menu.classList.add("hidden");
    }

    // Open profile
    openProfile();
}

/* ==========================================
   🔎 MENU SEARCH
========================================== */

function focusMenuSearch() {
    showFeaturePanel("search");
}


/* ==========================================
   ❤️ INVITE FRIENDS
========================================== */

function inviteFriends() {

    if (navigator.share) {

        navigator.share({

            title: "Join me on FREE CHAT",

            text:
                "Come join me on FREE CHAT! " +
                "Connect. Chat. Stay close."

        }).catch(() => {});

    } else {

        alert(
            "❤️ Invite Friends\n\n" +
            "Share FREE CHAT with your friends."
        );

    }

}

/* ==========================================
   👥 GROUPS SCREEN
========================================== */

function openGroups() {
    console.log("👥 Opening Communities...");

    if (typeof closeMainMenu === "function") {
        closeMainMenu();
    }

    const homeScreen = document.getElementById("homeScreen");
    const groupsScreen = document.getElementById("groupsScreen");

    if (!groupsScreen) {
        console.error("Groups screen not found.");
        return;
    }

    // Hide other independent screens
    [
        "reelsScreen",
        "chatScreen",
        "friendsScreen"
    ].forEach(id => {
        const screen = document.getElementById(id);

        if (screen) {
            screen.classList.add("hidden");
        }
    });

    // Keep Home visible so its bottom navigation remains available
    if (homeScreen) {
        homeScreen.classList.remove("hidden");
        homeScreen.classList.add("groups-mode");
    }

    // Display Communities separately
    groupsScreen.classList.remove("hidden");

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });

    console.log("✅ Communities opened.");
}

/* ==========================================
   🎬 REELS
========================================== */

function openReels() {

    closeMainMenu();

    alert(
        "🎬 Reels\n\n" +
        "FREE CHAT Reels are coming next."
    );

}


/* ==========================================
   🛍️ MARKETPLACE
========================================== */

function openMarketplace() {
    closeMainMenu();
    showFeaturePanel("marketplace");
}


/* ==========================================
   ✨ FREE CHAT AI
========================================== */

function openFreeChatAI() {

    closeMainMenu();

    alert(
        "✨ FREE CHAT AI\n\n" +
        "Your AI assistant is coming next."
    );

}


/* ==========================================
   🕐 MEMORIES
========================================== */

function openMemories() {
    closeMainMenu();
    showFeaturePanel("memories");
}


/* ==========================================
   🎁 BIRTHDAYS
========================================== */

function openBirthdays() {

    closeMainMenu();

    alert(
        "🎁 Birthdays\n\n" +
        "Birthday reminders are coming next."
    );

}


/* ==========================================
   📅 EVENTS
========================================== */

function openEvents() {

    closeMainMenu();

    alert(
        "📅 Events\n\n" +
        "FREE CHAT Events are coming next."
    );

}


/* ==========================================
   ✓ VERIFICATION
========================================== */

function openVerification() {

    closeMainMenu();

    alert(
        "✓ Verification\n\n" +
        "Account verification is coming next."
    );

}
/* ==========================================
   👤 ADD ACCOUNT — FIX MENU NAVIGATION
========================================== */

async function addAccount() {
    try {
        const {
            data: { session },
            error
        } = await supabaseClient.auth.getSession();

        if (error) throw error;

        // Confirm before signing out the current user
        if (session) {
            const confirmed = confirm(
                "👤 ADD ANOTHER ACCOUNT\n\n" +
                "You are currently signed in.\n\n" +
                "FREE CHAT will sign out of your current account first.\n\n" +
                "Do you want to continue?"
            );

            if (!confirmed) return;
        }

        // Sign out if a session exists
        if (session) {
            const {
                error: signOutError
            } = await supabaseClient.auth.signOut();

            if (signOutError) throw signOutError;
        }

        // Hide the signup screen
        const signupBox =
            document.getElementById("signupBox");

        if (signupBox) {
            signupBox.classList.add("hidden");
        }

        // Show the login screen
        const loginBox =
            document.getElementById("loginBox");

        if (loginBox) {
            loginBox.classList.remove("hidden");
        }

        // Close the Menu screen
        const menuScreen =
            document.getElementById("menuScreen");

        if (menuScreen) {
            menuScreen.classList.add("hidden");
        }

        // Hide other screens that might cover the login screen
        const screenIds = [
            "homeScreen",
            "reelsScreen",
            "friendsScreen",
            "chatScreen",
            "notificationsScreen"
        ];

        screenIds.forEach(id => {
            const screen = document.getElementById(id);

            if (screen) {
                screen.classList.add("hidden");
            }
        });

        // Clear old login messages
        if (typeof clearMessage === "function") {
            clearMessage();
        }

        // Scroll back to the top
        window.scrollTo({
            top: 0,
            behavior: "auto"
        });

        alert(
            "✅ Signed out successfully.\n\n" +
            "You can now log in with another account."
        );

    } catch (error) {
        console.error("❌ Add account error:", error);

        alert(
            "Unable to switch accounts.\n\n" +
            (error.message || "Please try again.")
        );
    }
}

/* ==========================================
   📡 MOBILE CENTER
========================================== */

function openMobileCenter() {

    closeMainMenu();

    alert(
        "📡 Mobile Center\n\n" +
        "Mobile Center is coming next."
    );

}
/* ==========================================
   📰 FEEDS
========================================== */

async function openFeeds() {
    console.log("📰 Opening FREE CHAT Feeds...");

    if (typeof closeMainMenu === "function") {
        closeMainMenu();
    }

    const feed = document.getElementById("socialFeed");
    const homeScreen = document.getElementById("homeScreen");
    const reelsScreen = document.getElementById("reelsScreen");
    const chatScreen = document.getElementById("chatScreen");
    const friendsScreen = document.getElementById("friendsScreen");

    if (!feed) {
        console.error("❌ socialFeed not found in index.html");
        alert("We couldn't find the social feed.");
        return;
    }

    // Show the home screen containing the existing feed
    if (homeScreen) {
        homeScreen.classList.remove("hidden");
    }

    // Hide other screens
    [reelsScreen, chatScreen, friendsScreen].forEach(screen => {
        if (screen) {
            screen.classList.add("hidden");
        }
    });

    // Scroll to the feed
    feed.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });

    // Load posts from Supabase
    if (typeof loadFeed === "function") {
        await loadFeed();
    } else {
        console.error("❌ loadFeed() function not found.");
    }
}

/* ==========================================
   📸 PHOTOS
========================================== */

function openPhotos() {

    closeMainMenu();

    alert(
        "📸 Photos\n\n" +
        "Your photos section is coming next."
    );

}


/* =========================================================
   MENU FEATURES: SEARCH, MEMORIES, MARKETPLACE
   Current version stores memories/listings in this browser.
========================================================= */
function fcEscapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[ch]));
}

function fcGetLocalList(key) {
    try {
        const value = JSON.parse(localStorage.getItem(key) || "[]");
        return Array.isArray(value) ? value : [];
    } catch (error) {
        console.warn("Could not read local FREE CHAT data:", error);
        return [];
    }
}

function fcSaveLocalList(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (error) {
        alert("Your browser could not save this item. Check available storage and try again.");
        return false;
    }
}

function fcEnsureFeaturePanel() {
    let panel = document.getElementById("fcFeaturePanel");
    if (panel) return panel;

    panel = document.createElement("div");
    panel.id = "fcFeaturePanel";
    panel.className = "fc-feature-overlay hidden";
    panel.innerHTML = `
      <section class="fc-feature-dialog" role="dialog" aria-modal="true" aria-labelledby="fcFeatureTitle">
        <header class="fc-feature-head">
          <div><h2 id="fcFeatureTitle">FREE CHAT</h2><p id="fcFeatureSubtitle"></p></div>
          <button type="button" class="fc-feature-close" aria-label="Close" onclick="closeFeaturePanel()">×</button>
        </header>
        <div id="fcFeatureContent" class="fc-feature-content"></div>
      </section>`;
    panel.addEventListener("click", event => {
        if (event.target === panel) closeFeaturePanel();
    });
    document.body.appendChild(panel);
    return panel;
}

function closeFeaturePanel() {
    const panel = document.getElementById("fcFeaturePanel");
    if (panel) {
        panel.classList.add("hidden");
        panel.classList.remove("fc-marketplace-page");
    }
}

function showFeaturePanel(feature) {
    const panel = fcEnsureFeaturePanel();
    const title = document.getElementById("fcFeatureTitle");
    const subtitle = document.getElementById("fcFeatureSubtitle");
    const content = document.getElementById("fcFeatureContent");
    panel.dataset.feature = feature;
    panel.classList.remove("hidden");
    panel.classList.toggle("fc-marketplace-page", feature === "marketplace");

    if (feature === "search") {
        title.textContent = "Search menu";
        subtitle.textContent = "Find a FREE CHAT section";
        content.innerHTML = `
          <label class="fc-feature-label" for="fcMenuSearchInput">Search menu</label>
          <input id="fcMenuSearchInput" class="fc-feature-input" type="search" placeholder="Try Marketplace, Memories, Friends..." autocomplete="off">
          <div id="fcMenuSearchResults" class="fc-feature-list"></div>`;
        const input = document.getElementById("fcMenuSearchInput");
        input.addEventListener("input", renderMenuSearchResults);
        renderMenuSearchResults();
        input.focus();
    } else if (feature === "memories") {
        title.textContent = "🕐 Memories";
        subtitle.textContent = "Keep a note of moments that matter";
        renderMemories();
    } else if (feature === "marketplace") {
        title.textContent = "🛍️ Marketplace";
        subtitle.textContent = "Browse or add a local listing";
        renderMarketplace();
    }
}

function renderMenuSearchResults() {
    const input = document.getElementById("fcMenuSearchInput");
    const results = document.getElementById("fcMenuSearchResults");
    if (!input || !results) return;
    const query = input.value.trim().toLowerCase();
    const buttons = Array.from(document.querySelectorAll(".fc-menu-grid-item"));
    const entries = buttons.map(button => ({
        label: button.innerText.replace(/\s+/g, " ").trim(),
        onclick: button.getAttribute("onclick")
    })).filter(item => item.label && (!query || item.label.toLowerCase().includes(query)));

    if (!entries.length) {
        results.innerHTML = '<p class="fc-feature-empty">No menu sections found. Try another word.</p>';
        return;
    }
    results.innerHTML = entries.map((item, index) => `
      <button type="button" class="fc-feature-row" data-menu-index="${index}">
        <span>${fcEscapeHTML(item.label)}</span><span aria-hidden="true">›</span>
      </button>`).join("");
    results.querySelectorAll("[data-menu-index]").forEach((button, index) => {
        button.addEventListener("click", () => {
            const action = entries[index].onclick || "";
            closeFeaturePanel();
            const fn = action.match(/^\s*([A-Za-z_$][\w$]*)\s*\(/);
            if (fn && typeof window[fn[1]] === "function") window[fn[1]]();
        });
    });
}

function renderMemories() {
    const content = document.getElementById("fcFeatureContent");
    const memories = fcGetLocalList("freeChatMemories");
    content.innerHTML = `
      <form id="fcMemoryForm" class="fc-feature-form">
        <label class="fc-feature-label" for="fcMemoryText">Save a memory</label>
        <textarea id="fcMemoryText" class="fc-feature-input" rows="3" maxlength="1000" placeholder="Write a moment you want to remember..." required></textarea>
        <button class="fc-feature-primary" type="submit">＋ Save memory</button>
      </form>
      <h3 class="fc-feature-section-title">Your memories (${memories.length})</h3>
      <div class="fc-feature-list" id="fcMemoriesList"></div>`;
    const list = document.getElementById("fcMemoriesList");
    if (!memories.length) {
        list.innerHTML = '<p class="fc-feature-empty">No memories saved yet. Add your first one above.</p>';
    } else {
        list.innerHTML = memories.slice().reverse().map(item => `
          <article class="fc-feature-card">
            <p>${fcEscapeHTML(item.text).replace(/\n/g, "<br>")}</p>
            <small>${fcEscapeHTML(item.date || "")}</small>
            <button type="button" class="fc-feature-delete" data-memory-id="${fcEscapeHTML(item.id)}">Delete</button>
          </article>`).join("");
    }
    document.getElementById("fcMemoryForm").addEventListener("submit", event => {
        event.preventDefault();
        const text = document.getElementById("fcMemoryText").value.trim();
        if (!text) return;
        memories.push({id: String(Date.now()) + Math.random().toString(16).slice(2), text, date: new Date().toLocaleString()});
        if (fcSaveLocalList("freeChatMemories", memories)) renderMemories();
    });
    list.querySelectorAll("[data-memory-id]").forEach(button => button.addEventListener("click", () => {
        const updated = fcGetLocalList("freeChatMemories").filter(item => item.id !== button.dataset.memoryId);
        if (fcSaveLocalList("freeChatMemories", updated)) renderMemories();
    }));
}

async function renderMarketplace() {
    const content = document.getElementById("fcFeatureContent");
    if (!content) return;

    content.innerHTML = `
      <div class="fc-marketplace-toolbar">
        <p class="fc-feature-note">Browse listings shared by FREE CHAT users. Listings are stored online.</p>
        <button type="button" class="fc-feature-secondary" id="fcMarketRefresh">↻ Refresh listings</button>
      </div>
      <form id="fcMarketForm" class="fc-feature-form">
        <h3 class="fc-feature-section-title">Sell an item</h3>
        <label class="fc-feature-label" for="fcMarketName">Item name</label>
        <input id="fcMarketName" class="fc-feature-input" maxlength="80" placeholder="e.g. Used phone" required>
        <label class="fc-feature-label" for="fcMarketPrice">Price (₦)</label>
        <input id="fcMarketPrice" class="fc-feature-input" type="number" min="1" step="1" placeholder="e.g. 25000" required>
        <label class="fc-feature-label" for="fcMarketDescription">Description</label>
        <textarea id="fcMarketDescription" class="fc-feature-input" rows="3" maxlength="500" placeholder="Condition and item details"></textarea>
        <label class="fc-feature-label" for="fcMarketLocation">Seller location (City, State)</label>
        <input id="fcMarketLocation" class="fc-feature-input" type="text" maxlength="100" placeholder="e.g. Ibadan, Oyo State" autocomplete="address-level2" required>
        <p class="fc-feature-note">Enter your city and state only. Do not post your home address.</p>
        <label class="fc-feature-label" for="fcMarketImages">Item pictures (up to 5)</label>
        <input id="fcMarketImages" class="fc-feature-input" type="file" accept="image/*" multiple>
        <div id="fcMarketImagePreview" class="fc-market-image-preview" aria-live="polite"></div>
        <p class="fc-feature-note">Choose clear pictures. Images upload online when you publish.</p>
        <button class="fc-feature-primary" type="submit">＋ Publish listing</button>
        <p id="fcMarketStatus" class="fc-feature-note" role="status"></p>
      </form>
      <h3 class="fc-feature-section-title">Marketplace listings</h3>
      <div id="fcMarketList" class="fc-feature-list"><p class="fc-feature-empty">Loading listings…</p></div>`;

    const status = document.getElementById("fcMarketStatus");
    const list = document.getElementById("fcMarketList");
    const refreshButton = document.getElementById("fcMarketRefresh");
    const form = document.getElementById("fcMarketForm");
    const imageInput = document.getElementById("fcMarketImages");
    const imagePreview = document.getElementById("fcMarketImagePreview");

    imageInput.addEventListener("change", () => {
        const files = Array.from(imageInput.files || []);
        if (files.length > 5) {
            status.textContent = "Please choose no more than 5 pictures.";
            imageInput.value = "";
            imagePreview.innerHTML = "";
            return;
        }
        if (files.some(file => !file.type.startsWith("image/"))) {
            status.textContent = "Please select image files only.";
            imageInput.value = "";
            imagePreview.innerHTML = "";
            return;
        }
        if (files.some(file => file.size > 5 * 1024 * 1024)) {
            status.textContent = "Each picture must be 5 MB or smaller.";
            imageInput.value = "";
            imagePreview.innerHTML = "";
            return;
        }
        status.textContent = "";
        imagePreview.innerHTML = files.map(file => `<div class="fc-market-preview-card"><img src="${URL.createObjectURL(file)}" alt="Picture preview"><small>${fcEscapeHTML(file.name)}</small></div>`).join("");
    });

    async function loadListings() {
        list.innerHTML = '<p class="fc-feature-empty">Loading listings…</p>';
        if (typeof supabaseClient === "undefined" || !supabaseClient) {
            list.innerHTML = '<p class="fc-feature-empty">Marketplace cannot connect to Supabase. Check supabase.js and your internet connection.</p>';
            return;
        }
        const { data, error } = await supabaseClient
            .from("marketplace_place_listings")
            .select("id, user_id, item_name, price, description, location, image_urls, image_url, created_at")
            .order("created_at", { ascending: false });

        if (error) {
            console.error("Marketplace load failed:", error);
            list.innerHTML = `<p class="fc-feature-empty">${error.code === "42P01" || error.code === "PGRST205" ? "Marketplace database is not set up yet. Run the SQL file included with this project in Supabase SQL Editor." : "Could not load listings. Check the Marketplace table and its Row Level Security policies in Supabase, then tap Refresh."}</p>`;
            return;
        }

        const listings = data || [];
        if (!listings.length) {
            list.innerHTML = '<p class="fc-feature-empty">No listings yet. Be the first to publish an item!</p>';
            return;
        }
        list.innerHTML = listings.map(item => {
            const isOwner = Boolean(currentUserId && item.user_id === currentUserId);
            const date = item.created_at ? new Date(item.created_at).toLocaleString() : "";
            const imageUrls = Array.isArray(item.image_urls) && item.image_urls.length
                ? item.image_urls
                : (item.image_url ? [item.image_url] : []);
            const imageMarkup = imageUrls.map(url => `<a class="fc-market-image-link" href="${fcEscapeHTML(url)}" target="_blank" rel="noopener"><img class="fc-market-image" src="${fcEscapeHTML(url)}" alt="${fcEscapeHTML(item.item_name)}" loading="lazy"></a>`).join("");
            return `<article class="fc-feature-card fc-market-listing">
              ${imageMarkup ? `<div class="fc-market-image-grid">${imageMarkup}</div>` : ""}
              <strong class="fc-market-item-name">${fcEscapeHTML(item.item_name)}</strong>
              <div class="fc-feature-price">₦${Number(item.price).toLocaleString("en-NG")}</div>
              ${item.description ? `<p>${fcEscapeHTML(item.description).replace(/\n/g, "<br>")}</p>` : ""}
              <p class="fc-market-location">📍 <strong>Seller location:</strong> ${fcEscapeHTML(item.location || "Location not provided")}</p>
              <small>Posted ${fcEscapeHTML(date)}${isOwner ? " · Your listing" : ""}</small>
              ${isOwner ? `<button type="button" class="fc-feature-delete" data-market-delete="${fcEscapeHTML(item.id)}">Delete listing</button>` : ""}
            </article>`;
        }).join("");

        list.querySelectorAll("[data-market-delete]").forEach(button => {
            button.addEventListener("click", async () => {
                if (!currentUserId) return;
                if (!confirm("Delete this listing?")) return;
                button.disabled = true;
                const { error: deleteError } = await supabaseClient
                    .from("marketplace_place_listings")
                    .delete()
                    .eq("id", button.dataset.marketDelete)
                    .eq("user_id", currentUserId);
                if (deleteError) {
                    console.error("Marketplace delete failed:", deleteError);
                    alert("Could not delete this listing. Please try again.");
                    button.disabled = false;
                    return;
                }
                await loadListings();
            });
        });
    }

    refreshButton.addEventListener("click", loadListings);
    form.addEventListener("submit", async event => {
        event.preventDefault();
        status.textContent = "Publishing listing…";
        const { data: authData, error: authError } = await supabaseClient.auth.getUser();
        const user = authData && authData.user;
        if (authError || !user) {
            status.textContent = "Please sign in before publishing a listing.";
            return;
        }
        const name = document.getElementById("fcMarketName").value.trim();
        const price = Number(document.getElementById("fcMarketPrice").value);
        const description = document.getElementById("fcMarketDescription").value.trim();
        const location = document.getElementById("fcMarketLocation").value.trim();
        if (!name || !Number.isFinite(price) || price <= 0) {
            status.textContent = "Enter an item name and a price greater than ₦0.";
            return;
        }
        if (!location) {
            status.textContent = "Please enter the seller's city and state.";
            document.getElementById("fcMarketLocation").focus();
            return;
        }
        const submitButton = form.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        const selectedImages = Array.from(imageInput.files || []);
        const uploadedImageUrls = [];
        if (selectedImages.length) {
            status.textContent = "Uploading item pictures…";
            for (const file of selectedImages) {
                const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
                const storagePath = `${user.id}/${Date.now()}_${Math.random().toString(16).slice(2)}_${safeName}`;
                const { error: uploadError } = await supabaseClient.storage
                    .from("marketplace-images")
                    .upload(storagePath, file, { cacheControl: "3600", upsert: false, contentType: file.type });
                if (uploadError) {
                    console.error("Marketplace image upload failed:", uploadError);
                    submitButton.disabled = false;
                    status.textContent = "Picture upload failed. Run the Marketplace SQL setup file, then try again.";
                    return;
                }
                const { data: publicData } = supabaseClient.storage
                    .from("marketplace-images")
                    .getPublicUrl(storagePath);
                if (publicData && publicData.publicUrl) uploadedImageUrls.push(publicData.publicUrl);
            }
        }
        status.textContent = "Publishing listing…";
        const { error: insertError } = await supabaseClient
            .from("marketplace_place_listings")
            .insert({ user_id: user.id, item_name: name, price, description: description || null, location, image_urls: uploadedImageUrls });
        submitButton.disabled = false;
        if (insertError) {
            console.error("Marketplace publish failed:", insertError);
            status.textContent = insertError.code === "42P01" || insertError.code === "PGRST205"
                ? "The Marketplace database is not set up yet. Run the included SQL setup file in Supabase."
                : "Could not publish. Check your Supabase table permissions and try again.";
            return;
        }
        form.reset();
        status.textContent = "Your listing is live and visible to other users!";
        await loadListings();
    });

    await loadListings();
}

/* =========================================================
   REALTIME MESSAGES
========================================================= */

function subscribeToMessages() {

    if (!currentConversationId) {
        console.warn(
            "⚠️ No conversation for realtime messages."
        );
        return;
    }


    /* =====================================
       REMOVE PREVIOUS CHANNEL
    ===================================== */

    if (messageChannel) {

        supabaseClient
            .removeChannel(
                messageChannel
            );

        messageChannel = null;
    }


    /* =====================================
       CREATE CHANNEL
    ===================================== */

    const channelName =
        "chat-" +
        currentConversationId;


    messageChannel =
        supabaseClient
            .channel(channelName)


            /* =====================================
               NEW MESSAGE
            ===================================== */

            .on(

                "postgres_changes",

                {
                    event: "INSERT",
                    schema: "public",
                    table: "messages",

                    filter:
                        "conversation_id=eq." +
                        currentConversationId
                },

                async payload => {

                    console.log(
                        "📨 New message:",
                        payload.new
                    );


                    /*
                       Reload messages so the new
                       message appears immediately.
                    */

                    await loadMessages();

                }

            )


            /* =====================================
               MESSAGE STATUS UPDATE
               DELIVERED / SEEN
            ===================================== */

            .on(

                "postgres_changes",

                {
                    event: "UPDATE",
                    schema: "public",
                    table: "messages",

                    filter:
                        "conversation_id=eq." +
                        currentConversationId
                },

                async payload => {

                    console.log(
                        "🔄 Message status updated:",
                        payload.new
                    );


                    /*
                       Reload the message so
                       ✓ / ✓✓ updates immediately.
                    */

                    await loadMessages();

                }

            )


            /* =====================================
               SUBSCRIBE
            ===================================== */

            .subscribe(status => {

                console.log(
                    "📡 Message realtime:",
                    status
                );

            });

}
/* Delivery/read status updates are handled inside loadMessages(). */

/* =========================================================
   MESSAGE KEYBOARD
========================================================= */

function handleMessageKey(event) {

    if (
        event.key === "Enter" &&
        !event.shiftKey
    ) {

        event.preventDefault();

        sendMessage();
    }
}


/* =========================================================
   FORMAT MESSAGE TIME
========================================================= */

function formatMessageTime(
    timestamp
) {

    if (!timestamp) {
        return "";
    }


    const date =
        new Date(timestamp);


    return date.toLocaleTimeString(
        [],
        {
            hour: "2-digit",
            minute: "2-digit"
        }
    );
}


/* =========================================================
   SEARCH CHATS
========================================================= */

function searchChats() {

    const input =
        document.getElementById(
            "chatSearch"
        );


    if (!input) return;


    const search =
        input.value
            .toLowerCase()
            .trim();


    const chats =
        document.querySelectorAll(
            ".chat-item"
        );


    let found = false;


    chats.forEach(chat => {

        const name =
            (
                chat.dataset.name ||
                ""
            ).toLowerCase();


        if (
            name.includes(search)
        ) {

            chat.style.display =
                "flex";

            found = true;

        } else {

            chat.style.display =
                "none";
        }

    });


    const empty =
        document.getElementById(
            "emptyChats"
        );


    if (empty) {

        empty.classList.toggle(
            "hidden",
            found || !search
        );
    }
}

/* =========================================================
   CHAT TABS
========================================================= */

function changeChatTab(
    type,
    button
) {

    document
        .querySelectorAll(
            ".chat-tabs button"
        )
        .forEach(btn => {

            btn.classList.remove(
                "active"
            );

        });


    if (button) {

        button.classList.add(
            "active"
        );
    }
}


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHTML(value) {

    return String(value)

        .replace(
            /&/g,
            "&amp;"
        )

        .replace(
            /</g,
            "&lt;"
        )

        .replace(
            />/g,
            "&gt;"
        )

        .replace(
            /"/g,
            "&quot;"
        )

        .replace(
            /'/g,
            "&#039;"
        );
}


/* =========================================================
   AUTH STATE
========================================================= */

let authInitialized = false;

supabaseClient.auth.onAuthStateChange((event, session) => {
    console.log("🔐 Auth event:", event);

    if (event === "SIGNED_OUT") {
        authInitialized = false;
        showLoginScreen();
        return;
    }

    if (event === "SIGNED_IN" && session && !authInitialized) {
        authInitialized = true;

        // Defer Supabase work until the auth callback finishes.
        setTimeout(async () => {
            try {
                await showHome();
                await startNotificationRealtime();
                await loadNotifications();
            } catch (error) {
                console.error("❌ Auth startup error:", {
                    message: error?.message,
                    name: error?.name,
                    stack: error?.stack
                });
            }
        }, 100);
    }
});


/* =========================================================
   PAGE START
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        console.log(
            "🚀 FREE CHAT script loaded."
        );


        const {
            data: {
                session
            }
        } =
            await supabaseClient.auth
                .getSession();


if (session) {

    await showHome();

    console.log(
        "🏠 Existing session found; Home opened."
    );

} else {

    showLoginScreen();

}


        /* Message keyboard */

        const input =
            document.getElementById(
                "messageInput"
            );


        if (input) {

            input.addEventListener(
                "keydown",
                handleMessageKey
            );
        }
    }
);


/* ==================
=======================================
   START
========================================================= */

console.log(
    "💬 FREE CHAT — complete chat system loaded."
);
/* =========================================================
   MESSAGE FORM
   PREVENT PAGE RELOAD + SEND MESSAGE
========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    const messageForm =
        document.getElementById("messageForm");

    if (!messageForm) {

        console.error(
            "❌ messageForm not found."
        );

        return;
    }


    messageForm.addEventListener(
        "submit",
        async function(event) {

            /* IMPORTANT:
               Prevent the browser from
               submitting/reloading the page.
            */

            event.preventDefault();

            console.log(
                "📤 Sending message..."
            );

            await sendMessage();

        }
    );


    console.log(
        "✅ Message form connected."
    );

});

let postLikes = {};

/* =========================================================
   FREE CHAT — SOCIAL FEED
========================================================= */

let allFeedPosts = [];
let postCommentCounts = {};

// 🔎 INITIALIZE FEED SEARCH
document.addEventListener("DOMContentLoaded", () => {
    setupFeedSearch();
});

/* =========================================================
   OPEN POST COMPOSER
========================================================= */

function focusPostInput() {

    const composer =
        document.getElementById("postComposer");

    const input =
        document.getElementById("postContent");


    if (!composer || !input) return;


    composer.classList.remove("hidden");

    setTimeout(() => {

        input.focus();

    }, 100);
}


/* =========================================================
   CHARACTER COUNT
========================================================= */

document.addEventListener("input", function(event) {

    if (event.target.id !== "postContent") {
        return;
    }


    const counter =
        document.getElementById(
            "postCharacterCount"
        );


    if (counter) {

        counter.textContent =
            `${event.target.value.length} / 1000`;

    }

});


/* =========================================================
   CREATE POST
========================================================= */

async function createPost() {

    try {

        console.log("🚀 CREATE POST STARTED");


        /* =====================================
           CHECK LOGIN
        ===================================== */

        const {
            data: { user },
            error: authError
        } = await supabaseClient.auth.getUser();


        if (authError) {
            throw authError;
        }


        if (!user) {

            alert("Please login first.");

            return;
        }


        console.log(
            "👤 Current user:",
            user.id
        );


        /* =====================================
           GET INPUTS
        ===================================== */

        const input =
            document.getElementById("postContent");

        const imageInput =
            document.getElementById("postImageInput");


        if (!input) {

            console.error(
                "❌ postContent not found"
            );

            return;
        }


        const content =
            input.value.trim();


        const imageFile =
            imageInput && imageInput.files && imageInput.files.length > 0
                ? imageInput.files[0]
                : null;
        const mediaType = imageFile && imageFile.type.startsWith("video/") ? "video" : "image";


        console.log(
            "📝 Content:",
            content
        );


        console.log(
            "📸 Image selected:",
            imageFile
                ? imageFile.name
                : "NO IMAGE"
        );


        /* =====================================
           CHECK CONTENT
        ===================================== */

        if (!content && !imageFile) {

            alert(
                "Write something or select a photo/video 😊"
            );

            return;
        }


        /* =====================================
           IMAGE URL
        ===================================== */

        let imageUrl = null;


        /* =====================================
           UPLOAD IMAGE
        ===================================== */

        if (imageFile) {

            console.log(
                "📸 Starting image upload..."
            );


            const fileExtension =
                imageFile.name
                    .split(".")
                    .pop()
                    .toLowerCase();


            const fileName =
                user.id +
                "_" +
                Date.now() +
                "." +
                fileExtension;


            const filePath =
                "posts/" +
                fileName;


            console.log(
                "📁 File path:",
                filePath
            );


            const {
                error: uploadError
            } =
                await supabaseClient
                    .storage
                    .from("post-images")
                    .upload(
                        filePath,
                        imageFile,
                        {
                            cacheControl: "3600",
                            upsert: false
                        }
                    );


            if (uploadError) {

                console.error(
                    "❌ Image upload error:",
                    uploadError
                );

                alert(
                    "Image upload failed:\n\n" +
                    uploadError.message
                );

                return;
            }


            console.log(
                "✅ Image uploaded successfully"
            );


            /* =====================================
               GET PUBLIC URL
            ===================================== */

            const {
                data: publicUrlData
            } =
                supabaseClient
                    .storage
                    .from("post-images")
                    .getPublicUrl(filePath);


            if (
                !publicUrlData ||
                !publicUrlData.publicUrl
            ) {

                console.error(
                    "❌ Public image URL not created"
                );

                alert(
                    "Image uploaded, but image URL could not be created."
                );

                return;
            }


            imageUrl =
                publicUrlData.publicUrl;


            console.log(
                "🌐 IMAGE URL:",
                imageUrl
            );

        }


        /* =====================================
           SHOW EXACT DATA BEFORE INSERT
        ===================================== */

        console.log(
            "📦 POST DATA:",
            {
                user_id: user.id,
                content: content || null,
                image_url: imageUrl
            }
        );


        /* =====================================
           INSERT POST
        ===================================== */

        const {
            data: post,
            error: postError
        } =
            await supabaseClient
                .from("posts")
                .insert({

                    user_id:
                        user.id,

                    content:
                        content || null,

                    image_url:
                        imageUrl,

                    media_type:
                        imageFile ? mediaType : null

                })
                .select()
                .single();


        if (postError) {

            console.error(
                "❌ Post creation error:",
                postError
            );

            alert(
                "Could not create post:\n\n" +
                postError.message
            );

            return;
        }


        console.log(
            "✅ POST SAVED TO DATABASE:",
            post
        );


        /* =====================================
           VERIFY IMAGE URL
        ===================================== */

        console.log(
            "🖼️ SAVED IMAGE URL:",
            post.image_url
        );


        /* =====================================
           CLEAR FORM
        ===================================== */

        input.value = "";


        if (imageInput) {

            imageInput.value = "";

        }


        const preview =
            document.getElementById(
                "postImagePreview"
            );


        if (preview) {

            preview.innerHTML = "";

            preview.classList.add(
                "hidden"
            );

        }


        /* =====================================
           RELOAD FEED
        ===================================== */

        console.log(
            "🔄 Reloading feed..."
        );


        await loadFeed();


        console.log(
            "🎉 POST PUBLISHED SUCCESSFULLY!"
        );


    } catch (error) {

        console.error(
            "❌ CREATE POST ERROR:",
            error
        );


        alert(
            "Something went wrong:\n\n" +
            error.message
        );

    }

}
/* =========================================================
   LOAD FEED
========================================================= */

async function loadFeed() {

    console.log(
        "📰 loadFeed() started"
    );


    const feed =
        document.getElementById(
            "socialFeed"
        );


    if (!feed) {

        console.error(
            "❌ socialFeed element not found"
        );

        return;
    }


    feed.innerHTML = `
        <div class="feed-loading">
            Loading posts...
        </div>
    `;


    try {

        console.log(
            "🔎 Fetching posts + profiles..."
        );


        /*
        ==========================================
        📰 LOAD POSTS + AUTHOR PROFILE
        ==========================================
        */

        const {
            data: posts,
            error
        } =
            await supabaseClient
                .from("posts")
                .select(`
                    id,
                    user_id,
                    content,
                    image_url,
                    media_type,
                    created_at,

                    profiles (
                        username,
                        avatar_url
                    )
                `)
                .order(
                    "created_at",
                    {
                        ascending: false
                    }
                );


        if (error) {

            console.error(
                "❌ Supabase feed error:",
                error
            );

            throw error;
        }


        console.log(
            "✅ Posts + profiles received:",
            posts
        );


        allFeedPosts =
            posts || [];


        /*
        ==========================================
        ❤️ LOAD LIKES
        ==========================================
        */

        await loadPostLikes(
            allFeedPosts
        );


        /*
        ==========================================
        💬 LOAD COMMENT COUNTS
        ==========================================
        */

        await loadPostCommentCounts(
            allFeedPosts
        );


        /*
        ==========================================
        📰 RENDER FEED
        ==========================================
        */

        renderFeed(
            allFeedPosts
        );


        /*
        ==========================================
        💬 LOAD COMMENTS
        ==========================================
        */

        for (const post of allFeedPosts) {
            // A feed search or another render may have replaced the visible cards.
            // Only load comments when this post's comments container is currently in the DOM.
            if (document.getElementById(`comments-${post.id}`)) {
                await loadComments(post.id);
            }
        }


        console.log(
            "✅ FREE CHAT feed loaded successfully"
        );


    } catch (error) {

        console.error(
            "❌ Feed loading error:",
            error
        );


        feed.innerHTML = `
            <div class="feed-empty">

                <div class="feed-empty-icon">
                    ⚠️
                </div>

                <h3>
                    Unable to load posts
                </h3>

                <p>
                    ${escapeHTML(
                        error.message ||
                        "Please try again."
                    )}
                </p>

                <button
                    type="button"
                    onclick="loadFeed()"
                >
                    🔄 Try Again
                </button>

            </div>
        `;

    }
}

/* =========================================================
   LIKE / UNLIKE POST
========================================================= */

async function likePost(postId) {

    console.log(
        "❤️ Like button clicked:",
        postId
    );

    try {

        /* =====================================
           GET CURRENT USER
        ===================================== */

        const {
            data: { user },
            error: userError
        } = await supabaseClient.auth.getUser();


        if (userError) {
            throw userError;
        }


        if (!user) {

            alert("Please login first.");

            return;
        }


        console.log(
            "👤 Like user:",
            user.id
        );


        /* =====================================
           FIND POST CARD
        ===================================== */

        const postCard =
            document.querySelector(
                `.post-card[data-post-id="${postId}"]`
            );


        if (!postCard) {

            console.error(
                "❌ Post card not found:",
                postId
            );

            return;
        }


        const likeButton =
            postCard.querySelector(
                ".like-button"
            );


        if (!likeButton) {

            console.error(
                "❌ Like button not found."
            );

            return;
        }


        /* =====================================
           CHECK EXISTING LIKE
        ===================================== */

        const {
            data: existingLike,
            error: checkError
        } = await supabaseClient
            .from("post_likes")
            .select("id")
            .eq("post_id", postId)
            .eq("user_id", user.id)
            .maybeSingle();


        if (checkError) {
            throw checkError;
        }


        let likedNow = false;


        /* =====================================
           UNLIKE
        ===================================== */

        if (existingLike) {

            console.log(
                "💔 Removing like..."
            );


            const {
                error: deleteError
            } = await supabaseClient
                .from("post_likes")
                .delete()
                .eq("id", existingLike.id);


            if (deleteError) {
                throw deleteError;
            }


            likedNow = false;


            console.log(
                "💔 Post unliked"
            );

        }


        /* =====================================
           LIKE
        ===================================== */

        else {

            console.log(
                "❤️ Adding like..."
            );


            const {
                error: insertError
            } = await supabaseClient
                .from("post_likes")
                .insert({

                    post_id: postId,

                    user_id: user.id

                });


            if (insertError) {
                throw insertError;
            }


likedNow = true;


console.log(
    "❤️ Post liked"
);


/* =====================================
   🔔 CREATE LIKE NOTIFICATION
===================================== */

try {

    // Get the owner of this post
    const {
        data: post,
        error: postError
    } = await supabaseClient
        .from("posts")
        .select("user_id")
        .eq("id", postId)
        .single();


    if (postError) {
        throw postError;
    }


    // Don't notify yourself
    if (
        post &&
        post.user_id !== user.id
    ) {

        const {
            error: notificationError
        } = await supabaseClient
            .from("notifications")
            .insert({

                user_id: post.user_id,

                sender_id: user.id,

                type: "like",

                post_id: postId,

                comment_id: null,

                message: "liked your post"

            });


        if (notificationError) {
            throw notificationError;
        }


        console.log(
            "🔔 Like notification created"
        );

    }

}
catch (notificationError) {

    console.error(
        "⚠️ Like notification error:",
        notificationError
    );

}

        }


        /* =====================================
           GET NEW LIKE COUNT
        ===================================== */

        const {
            count,
            error: countError
        } = await supabaseClient
            .from("post_likes")
            .select("*", {
                count: "exact",
                head: true
            })
            .eq("post_id", postId);


        if (countError) {
            throw countError;
        }


        const newCount =
            count || 0;


        /* =====================================
           UPDATE LOCAL LIKE DATA
        ===================================== */

        postLikes[postId] = {

            count: newCount,

            likedByMe: likedNow

        };


        /* =====================================
           UPDATE BUTTON ONLY
        ===================================== */

        likeButton.classList.toggle(
            "liked",
            likedNow
        );


        likeButton.innerHTML = `

            ${
                likedNow
                    ? "❤️ Liked"
                    : "♡ Like"
            }

            <span class="like-count">
                ${newCount}
            </span>

        `;


        console.log(
            "❤️ Like count updated:",
            newCount
        );


        /* =====================================
           IMPORTANT
           DO NOT RELOAD FEED
        ===================================== */

        console.log(
            "✅ Like updated without reloading feed"
        );

    }

    catch (error) {

        console.error(
            "❌ Like error:",
            error
        );


        alert(
            "Could not update like.\n\n" +
            (
                error.message ||
                "Please try again."
            )
        );

    }

}

/* =========================================================
   LOAD POST LIKES
========================================================= */

async function loadPostLikes(posts) {

    try {

        postLikes = {};

        if (!posts || !posts.length) {
            return;
        }

        const postIds =
            posts.map(post => post.id);

        const {
            data: likes,
            error
        } = await supabaseClient
            .from("post_likes")
            .select("post_id, user_id")
            .in("post_id", postIds);

        if (error) {
            throw error;
        }

        likes.forEach(like => {

            if (!postLikes[like.post_id]) {

                postLikes[like.post_id] = {
                    count: 0,
                    likedByMe: false
                };

            }

            postLikes[like.post_id].count++;

            if (
                like.user_id ===
                window.currentUserId
            ) {

                postLikes[like.post_id].likedByMe = true;

            }

        });

        console.log(
            "❤️ Likes loaded:",
            postLikes
        );

    } catch (error) {

        console.error(
            "❌ Loading likes failed:",
            error
        );

    }
}

/* =========================================================
   LOAD POST COMMENT COUNTS
========================================================= */

async function loadPostCommentCounts(posts) {

    try {

        postCommentCounts = {};

        if (!posts || !posts.length) {
            return;
        }


        const postIds =
            posts.map(post => post.id);


        const {
            data: comments,
            error
        } = await supabaseClient
            .from("post_comments")
            .select("post_id, parent_id")
            .in("post_id", postIds);


        if (error) {
            throw error;
        }


        comments.forEach(comment => {

            /* ONLY COUNT MAIN COMMENTS */
            if (comment.parent_id !== null) {
                return;
            }


            if (!postCommentCounts[comment.post_id]) {

                postCommentCounts[comment.post_id] = 0;

            }


            postCommentCounts[comment.post_id]++;

        });


        console.log(
            "💬 Main comment counts loaded:",
            postCommentCounts
        );


    } catch (error) {

        console.error(
            "❌ Loading comment counts failed:",
            error
        );

    }

}

/* =========================================================
   RENDER FEED
========================================================= */
function renderFeed(posts) {

    const feed =
        document.getElementById("socialFeed");

    if (!feed) return;


   
if (!posts || !posts.length) {

    const searchInput =
        document.getElementById("feedSearch");

    const isSearching =
        searchInput &&
        searchInput.value.trim().length > 0;

    feed.innerHTML = isSearching
        ? `
            <div class="feed-empty">
                <div class="feed-empty-icon">🔎</div>
                <h3>No posts found</h3>
                <p>Try another username or search term.</p>
                <button
                    type="button"
                    onclick="clearFeedSearch()"
                >
                    Clear search
                </button>
            </div>
        `
        : `
            <div class="feed-empty">
                <div class="feed-empty-icon">🌍</div>
                <h3>Your feed is empty</h3>
                <p>Be the first person to post something!</p>
            </div>
        `;

    return;
}


    feed.innerHTML =
        posts.map(post => {

            const profile =
                post.profiles || {};


            const username =
                profile.username ||
                "FREE CHAT USER";


            const avatar =
                profile.avatar_url ||
                "https://i.pravatar.cc/100?img=12";


            const time =
                formatPostTime(
                    post.created_at
                );


            const isOwnPost =
                post.user_id ===
                window.currentUserId;


            return `

                <article
                    class="post-card"
                    data-post-id="${post.id}"
                >

                    <!-- POST HEADER -->

                    <div class="post-header">
                    <img
    class="post-avatar"
    src="${escapeHTML(avatar)}"
    alt="${escapeHTML(username)}"
    onclick="openUserProfile('${post.user_id}')"
    style="cursor:pointer;"
>

<div
    class="post-author"
    onclick="openUserProfile('${post.user_id}')"
    style="cursor:pointer;"
>

    <h3>
        ${escapeHTML(username)}
    </h3>

    <time>
        ${time}
    </time>

</div>

                        ${
                            isOwnPost
                                ? `
                                    <button
                                        class="post-menu"
                                        type="button"
                                        onclick="deletePost('${post.id}')"
                                    >
                                        ⋮
                                    </button>
                                `
                                : ""
                        }

                    </div>


                    <!-- POST CONTENT -->

                    <div class="post-body">

                        ${
                            post.content
                                ? `
                                    <p>
                                        ${escapeHTML(
                                            post.content
                                        )}
                                    </p>
                                `
                                : ""
                        }


                        ${
                            post.image_url
                                ? `
                                    <div class="post-image-container">
                                        ${post.media_type === "video"
                                            ? `<video class="post-image post-feed-video" src="${escapeHTML(post.image_url)}" controls playsinline preload="metadata"></video>`
                                            : `<img class="post-image" src="${escapeHTML(post.image_url)}" alt="Post image" loading="lazy" onclick="openPostImage('${escapeHTML(post.image_url)}')">`}
                                    </div>
                                `
                                : ""
                        }

                    </div>


                    <!-- POST FOOTER -->

                    <div class="post-footer">

                        <button
                            type="button"
                            class="like-button ${
                                postLikes[post.id]?.likedByMe
                                    ? "liked"
                                    : ""
                            }"
                            data-post-id="${post.id}"
                            onclick="likePost('${post.id}')"
                        >

                            ${
                                postLikes[post.id]?.likedByMe
                                    ? "❤️ Liked"
                                    : "♡ Like"
                            }

                            <span class="like-count">
                                ${postLikes[post.id]?.count || 0}
                            </span>

                        </button>


                        <button
                            type="button"
                            class="comment-button"
                            onclick="commentPost('${post.id}')"
                        >

                            💬 Comment

                            <span class="comment-count">
                                ${postCommentCounts[post.id] || 0}
                            </span>

                        </button>

                    </div>


                    <!-- COMMENTS SECTION -->

                    <div
                        class="post-comments"
                        id="comments-${post.id}"
                    >

                        <div class="comments-loading">
                            Loading comments...
                        </div>

                    </div>


                    <!-- COMMENT INPUT -->

                    <form
                        class="comment-form"
                        onsubmit="submitComment(
                            event,
                            '${post.id}'
                        )"
                    >

                        <input
                            type="text"
                            id="commentInput-${post.id}"
                            class="comment-input"
                            placeholder="Write a comment..."
                            autocomplete="off"
                        >

                        <button
                            type="submit"
                            class="comment-submit"
                        >
                            ➤
                        </button>

                    </form>

                </article>

            `;

        }).join("");
}

// 🔎 FREE CHAT FEED SEARCH
function setupFeedSearch() {

    const searchInput =
        document.getElementById("feedSearch");

    if (!searchInput) {
        console.warn("🔎 Feed search input not found.");
        return;
    }

    // Prevent registering the same listener twice
    if (searchInput.dataset.searchInitialized === "true") {
        return;
    }

    searchInput.dataset.searchInitialized = "true";

    searchInput.addEventListener("input", function () {

        const query = this.value
            .trim()
            .toLowerCase();

        // Use the posts already loaded from Supabase
        const posts = Array.isArray(allFeedPosts)
            ? allFeedPosts
            : [];

        const filteredPosts = !query
            ? posts
            : posts.filter(post => {

                const content =
                    (post.content || "").toLowerCase();

                const username =
                    (post.profiles?.username || "")
                        .toLowerCase();

                return content.includes(query) ||
                       username.includes(query);
            });

        // Display matching posts
        renderFeed(filteredPosts);

        // Load comments for the currently displayed posts
        filteredPosts.forEach(post => {
            if (
                typeof loadComments === "function" &&
                document.getElementById(`comments-${post.id}`)
            ) {
                loadComments(post.id);
            }
        });

        console.log(
            `🔎 Search "${query}": ${filteredPosts.length} posts found.`
        );
    });

    console.log("✅ Feed search initialized.");
}



function clearFeedSearch() {
    const searchInput =
        document.getElementById("feedSearch");

    if (!searchInput) return;

    searchInput.value = "";
    searchInput.dispatchEvent(
        new Event("input", { bubbles: true })
    );

    searchInput.focus();
}


/* =========================================================
   OPEN POST IMAGE
========================================================= */

function openPostImage(imageUrl) {

    if (!imageUrl) return;

    const viewer =
        document.createElement("div");

    viewer.className =
        "post-image-viewer";

    viewer.innerHTML = `
        <button
            type="button"
            class="close-image-viewer"
        >
            ✕
        </button>

        <img
            src="${escapeHTML(imageUrl)}"
            alt="Post image"
        >
    `;


    viewer.addEventListener(
        "click",
        function(event) {

            if (
                event.target === viewer ||
                event.target.classList.contains(
                    "close-image-viewer"
                )
            ) {

                viewer.remove();
            }

        }
    );


    document.body.appendChild(
        viewer
    );
}
/* =========================================================
   POST TIME
========================================================= */

function formatPostTime(dateString) {

    const date =
        new Date(dateString);


    const seconds =
        Math.floor(
            (Date.now() - date.getTime()) /
            1000
        );


    if (seconds < 60) {
        return "Just now";
    }


    const minutes =
        Math.floor(
            seconds / 60
        );


    if (minutes < 60) {
        return `${minutes} min ago`;
    }


    const hours =
        Math.floor(
            minutes / 60
        );


    if (hours < 24) {
        return `${hours} hr ago`;
    }


    const days =
        Math.floor(
            hours / 24
        );


    if (days < 7) {
        return `${days} day${days === 1 ? "" : "s"} ago`;
    }


    return date.toLocaleDateString(
        undefined,
        {
            day: "numeric",
            month: "short",
            year: "numeric"
        }
    );

}

/* =========================================================
   DELETE POST
========================================================= */

async function deletePost(postId) {

    const confirmed =
        confirm(
            "Delete this post?"
        );


    if (!confirmed) return;


    try {

        const {
            error
        } =
            await supabaseClient
                .from("posts")
                .delete()
                .eq(
                    "id",
                    postId
                );


        if (error) {
            throw error;
        }


        await loadFeed();


    } catch (error) {

        console.error(
            "❌ Delete post error:",
            error
        );


        alert(
            "Unable to delete post.\n\n" +
            error.message
        );

    }

}

/* =========================================================
   OPEN COMMENTS
========================================================= */

async function commentPost(postId) {

    console.log(
        "💬 Opening comments:",
        postId
    );

    /* =====================================
       FIND THE POST
    ===================================== */

    const postCard =
        document.querySelector(
            `.post-card[data-post-id="${postId}"]`
        );

    if (!postCard) {

        console.error(
            "❌ Post card not found:",
            postId
        );

        return;
    }


    /* =====================================
       CHECK IF COMMENTS SECTION ALREADY EXISTS
    ===================================== */

    let commentsSection =
        postCard.querySelector(
            ".comments-section"
        );


    /* =====================================
       CREATE ONLY IF IT DOESN'T EXIST
    ===================================== */

    if (!commentsSection) {

        commentsSection =
            document.createElement("div");

        commentsSection.className =
            "comments-section";

        commentsSection.innerHTML = `

            <div class="comments-header">

                <div>
                    <strong>💬 Comments</strong>

                    <span
                        id="commentTitleCount-${postId}"
                    >
                        0
                    </span>
                </div>

                <button
                    type="button"
                    class="close-comments"
                    onclick="
                        this.closest('.comments-section')
                            .classList.add('hidden');
                    "
                >
                    ✕
                </button>

            </div>


            <div
                class="comments-list"
                id="comments-${postId}"
            >

                <div class="comments-loading">
                    Loading comments...
                </div>

            </div>


            <form
                class="comment-form"
                onsubmit="
                    submitComment(
                        event,
                        '${postId}'
                    )
                "
            >

                <input
                    type="text"
                    id="commentInput-${postId}"
                    class="comment-input"
                    placeholder="Write a comment..."
                    maxlength="1000"
                    autocomplete="off"
                    required
                >

                <button
                    type="submit"
                    aria-label="Send comment"
                >
                    ➤
                </button>

            </form>

        `;

        postCard.appendChild(
            commentsSection
        );

    } else {

        /* =====================================
           COMMENTS SECTION ALREADY EXISTS
           JUST MAKE SURE IT IS VISIBLE
        ===================================== */

        commentsSection.classList.remove(
            "hidden"
        );

    }


    /* =====================================
       LOAD COMMENTS
    ===================================== */

    await loadComments(postId);


    /* =====================================
       UPDATE TITLE COUNT
    ===================================== */

    const titleCount =
        document.getElementById(
            `commentTitleCount-${postId}`
        );

    if (titleCount) {

        titleCount.textContent =
            postCommentCounts[postId] || 0;

    }


    /* =====================================
       FOCUS COMMENT INPUT
    ===================================== */

    const input =
        document.getElementById(
            `commentInput-${postId}`
        );

    if (input) {
        input.focus();
    }


    console.log(
        "✅ Comments opened successfully:",
        postId
    );

}

/* =========================================================
   REPLY TO COMMENT
========================================================= */

function replyToComment(commentId, username, postId) {

    console.log(
        "↩️ Replying to:",
        commentId,
        username
    );

    /* Store the comment being replied to */
    replyingToComment = {
        id: commentId,
        username: username,
        postId: postId
    };


    /* Find the comment input */
    const input =
        document.getElementById(
            `commentInput-${postId}`
        );

    if (!input) {
        console.error(
            "❌ Comment input not found"
        );
        return;
    }


    /* Change placeholder */
    input.placeholder =
        `Replying to ${username}...`;


    /* Focus input */
    input.focus();


    /* Add visual reply indicator */
    let replyBox =
        document.getElementById(
            `replyingTo-${postId}`
        );

    if (!replyBox) {

        replyBox =
            document.createElement("div");

        replyBox.id =
            `replyingTo-${postId}`;

        replyBox.className =
            "replying-to";

        input.parentElement
            .insertBefore(
                replyBox,
                input
            );
    }


    replyBox.innerHTML = `
    <div class="replying-to-content">
        <span>↩️ Replying to <strong>@${username}</strong></span>

        <button
            type="button"
            class="cancel-reply"
            onclick="cancelReply('${postId}')"
        >
            ✕
        </button>
    </div>
`;

}

/* =========================================================
   CANCEL REPLY
========================================================= */

function cancelReply(postId) {

    replyingToComment = null;


    const input =
        document.getElementById(
            `commentInput-${postId}`
        );

    if (input) {

        input.placeholder =
            "Write a comment...";

    }


    const replyBox =
        document.getElementById(
            `replyingTo-${postId}`
        );

    if (replyBox) {
        replyBox.remove();
    }


    if (input) {
        input.focus();
    }

}

/* =========================================================
   SHOW / HIDE REPLIES
========================================================= */

function toggleReplies(commentId) {

    const replies =
        document.getElementById(
            `replies-${commentId}`
        );

    const button =
        document.getElementById(
            `viewReplies-${commentId}`
        );

    if (!replies || !button) return;

    const hidden =
        replies.classList.contains(
            "hidden-replies"
        );

    if (hidden) {

        replies.classList.remove(
            "hidden-replies"
        );

        button.innerHTML =
            "↥ Hide replies";

    } else {

        replies.classList.add(
            "hidden-replies"
        );

        const count =
            replies.dataset.count || 0;

        button.innerHTML =
            `↳ View ${count} ${
                count == 1
                    ? "reply"
                    : "replies"
            }`;

    }
}

/* =========================================================
   LOAD COMMENTS + REPLIES
========================================================= */

async function loadComments(postId) {

    console.log("💬 Loading comments for:", postId);

    const commentsList =
        document.getElementById(
            `comments-${postId}`
        );

    if (!commentsList) {
        // The post may have been filtered out or its card replaced by a newer render.
        // There is no visible comments container to update, so safely skip this request.
        return;
    }

    try {

        console.log(
            "🔎 Fetching comments from Supabase..."
        );

        const {
            data: comments,
            error
        } = await supabaseClient
            .from("post_comments")
            .select(`
                id,
                post_id,
                user_id,
                content,
                created_at,
                parent_id,
                profiles (
                    username,
                    avatar_url
                )
            `)
            .eq("post_id", postId)
            .order(
                "created_at",
                {
                    ascending: true
                }
            );

        if (error) {
            console.error(
                "❌ Supabase comment error:",
                error
            );
            throw error;
        }

        console.log(
            "✅ Comments received:",
            comments
        );

// ❤️ Load likes for these comments
const commentIds = comments.map(comment => comment.id);

if (commentIds.length > 0) {

    const {
        data: likes,
        error: likesError
    } = await supabaseClient
        .from("comment_likes")
        .select("comment_id, user_id")
        .in("comment_id", commentIds);

    if (likesError) {
        console.error(
            "❌ Comment likes error:",
            likesError
        );
    } else {

        const {
            data: { user }
        } = await supabaseClient
            .auth
            .getUser();

        commentIds.forEach(id => {

            const commentLikesList =
                likes.filter(
                    like =>
                        like.comment_id === id
                );

            commentLikes[id] = {
                count:
                    commentLikesList.length,

                likedByMe:
                    user
                        ? commentLikesList.some(
                            like =>
                                like.user_id ===
                                user.id
                        )
                        : false
            };

        });

        console.log(
            "❤️ Comment likes loaded:",
            commentLikes
        );
    }
}

        /* =====================================
           UPDATE COUNT
        ===================================== */

if (
    typeof postCommentCounts !==
    "undefined"
) {

    const mainCommentCount =
        comments
            ? comments.filter(
                comment =>
                    comment.parent_id === null
            ).length
            : 0;

    postCommentCounts[postId] =
        mainCommentCount;
}
        /* =====================================
           NO COMMENTS
        ===================================== */

        if (
            !comments ||
            comments.length === 0
        ) {

            commentsList.innerHTML = `
                <div class="no-comments">
                    No comments yet.
                    Be the first to comment! 💬
                </div>
            `;

            return;
        }


        /* =====================================
           SAFE HTML
        ===================================== */

        const safeHTML = (value) => {

            return String(value ?? "")
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");

        };


        /* =====================================
           CURRENT USER
        ===================================== */

        const currentUserId =
            window.currentUserId || null;


        /* =====================================
           CREATE COMMENT HTML
        ===================================== */

        function createCommentHTML(
            comment,
            depth = 0
        ) {

            const profile =
                comment.profiles || {};

            const username =
                profile.username ||
                "FREE CHAT USER";

            const avatar =
                profile.avatar_url ||
                "https://i.pravatar.cc/100?img=12";

            const time =
                typeof formatPostTime ===
                "function"
                    ? formatPostTime(
                        comment.created_at
                    )
                    : "Just now";

            const isOwnComment =
                comment.user_id ===
                currentUserId;


            /* =================================
               LIMIT VISUAL NESTING
            ================================= */

            const visualDepth =
                Math.min(depth, 4);


            /* =================================
               FIND REPLIES
            ================================= */

            const replies =
                comments.filter(
                    child =>
                        child.parent_id ===
                        comment.id
                );


            return `

                <div
                    class="comment-wrapper"
                    style="
                        margin-left:
                        ${visualDepth * 28}px;
                    "
                >

                    <div
                        class="comment-item"
                        data-comment-id="${safeHTML(
                            comment.id
                        )}"
                    >

<img
    class="comment-avatar"
    src="${safeHTML(avatar)}"
    alt="${safeHTML(username)}"
    onclick="openUserProfile('${safeHTML(comment.user_id)}')"
    style="cursor:pointer;"
>


                        <div class="comment-main">

<div class="comment-bubble">

    ${
        comment.parent_id
            ? `
                <div class="reply-reference">
                    ↩️ Replying to
                    <strong>
                        @${safeHTML(
                            comments.find(
                                parent =>
                                    parent.id ===
                                    comment.parent_id
                            )?.profiles?.username ||
                            "user"
                        )}
                    </strong>
                </div>
            `
            : ""
    }

    <strong
    onclick="openUserProfile('${safeHTML(comment.user_id)}')"
    style="cursor:pointer;"
>
    ${safeHTML(username)}
</strong>

    <p>
        ${safeHTML(comment.content)}
    </p>

</div>


<div class="comment-meta">

    <span>
        ${formatTime(comment.created_at)}
    </span>

    <button
        type="button"
        class="comment-like-btn"
        onclick="toggleCommentLike('${safeHTML(comment.id)}')"
    >
        ${
            commentLikes[comment.id]?.likedByMe
                ? "❤️"
                : "♡"
        }
        <span class="comment-like-count">
            ${commentLikes[comment.id]?.count || 0}
        </span>
    </button>

    <button
        type="button"
        class="reply-comment"
        onclick="replyToComment(
            '${safeHTML(comment.id)}',
            '${safeHTML(username)}',
            '${safeHTML(postId)}'
        )"
    >
        ↩️ Reply
    </button>

</div>


                                ${
                                    isOwnComment
                                        ? `
                                            <button
                                                type="button"
                                                class="delete-comment"
                                                onclick="deleteComment(
                                                    '${safeHTML(
                                                        comment.id
                                                    )}',
                                                    '${safeHTML(
                                                        postId
                                                    )}'
                                                )"
                                            >
                                                Delete
                                            </button>
                                        `
                                        : ""
                                }

                            </div>

                        </div>

                    </div>
       ${
    replies.length
        ? `
            <button
                type="button"
                id="viewReplies-${safeHTML(comment.id)}"
                class="view-replies-btn"
                onclick="toggleReplies('${safeHTML(comment.id)}')"
            >
                ↳ View ${replies.length}
                ${
                    replies.length === 1
                        ? "reply"
                        : "replies"
                }
            </button>

            <div
                id="replies-${safeHTML(comment.id)}"
                class="comment-replies hidden-replies"
                data-count="${replies.length}"
            >
                ${replies
                    .map(
                        reply =>
                            createCommentHTML(
                                reply,
                                depth + 1
                            )
                    )
                    .join("")}
            </div>
        `
        : ""
}

                `;

        }


        /* =====================================
           ONLY ROOT COMMENTS FIRST
        ===================================== */

        const rootComments =
            comments.filter(
                comment =>
                    !comment.parent_id
            );


        /* =====================================
           RENDER
        ===================================== */

        commentsList.innerHTML =
            rootComments
                .map(
                    comment =>
                        createCommentHTML(
                            comment
                        )
                )
                .join("");


        /* =====================================
           UPDATE TITLE COUNT
        ===================================== */

        const titleCount =
            document.getElementById(
                `commentTitleCount-${postId}`
            );

        if (titleCount) {

            titleCount.textContent =
                comments.length;

        }


        console.log(
            "✅ Comments + replies rendered:",
            comments.length
        );

    } catch (error) {

        console.error(
            "❌ Loading comments failed:",
            error
        );

        console.error(
            "❌ Error message:",
            error?.message
        );

        console.error(
            "❌ Error stack:",
            error?.stack
        );

        commentsList.innerHTML = `
            <div class="comments-error">
                Unable to load comments.
            </div>
        `;

    }

}


async function toggleCommentLike(commentId) {

    try {

        const {
            data: { user },
            error: userError
        } = await supabaseClient
            .auth
            .getUser();

        if (userError) throw userError;

        if (!user) {
            alert("Please login first.");
            return;
        }

        const existingLike =
            await supabaseClient
                .from("comment_likes")
                .select("id")
                .eq("comment_id", commentId)
                .eq("user_id", user.id)
                .maybeSingle();

        if (existingLike.error) {
            throw existingLike.error;
        }

        if (existingLike.data) {

            // 💔 Unlike
            const { error } =
                await supabaseClient
                    .from("comment_likes")
                    .delete()
                    .eq("id", existingLike.data.id);

            if (error) throw error;

            console.log("💔 Comment unliked");

        } else {

            // ❤️ Like
            const { error } =
                await supabaseClient
                    .from("comment_likes")
                    .insert({
                        comment_id: commentId,
                        user_id: user.id
                    });

            if (error) throw error;

            console.log("❤️ Comment liked");
        }
/* =====================================
   🔔 COMMENT LIKE NOTIFICATION
===================================== */

try {

    const {
        data: comment,
        error: commentError
    } = await supabaseClient
        .from("post_comments")
        .select("user_id, post_id")
        .eq("id", commentId)
        .single();

    if (commentError) {
        throw commentError;
    }

    // Don't notify yourself
    if (
        comment &&
        comment.user_id !== user.id
    ) {

        const {
            error: notificationError
        } = await supabaseClient
            .from("notifications")
            .insert({

                user_id:
                    comment.user_id,

                sender_id:
                    user.id,

                type:
                    "like",

                post_id:
                    comment.post_id,

                comment_id:
                    commentId,

                message:
                    "liked your comment"

            });

        if (notificationError) {
            throw notificationError;
        }

        console.log(
            "🔔 Comment like notification created"
        );
    }

}
catch (notificationError) {

    console.error(
        "⚠️ Comment like notification error:",
        notificationError
    );

}
        // 🔄 Get updated count
        const {
            count,
            error: countError
        } = await supabaseClient
            .from("comment_likes")
            .select("*", {
                count: "exact",
                head: true
            })
            .eq("comment_id", commentId);

        if (countError) throw countError;

        // Update local state
        commentLikes[commentId] = {
            count: count || 0,
            likedByMe: !existingLike.data
        };

        // Update button without reloading feed
        const buttons =
            document.querySelectorAll(
                `.comment-like-btn`
            );

        buttons.forEach(button => {

            if (
                button.getAttribute("onclick")?.includes(
                    commentId
                )
            ) {

                button.innerHTML = `
                    ${
                        commentLikes[commentId].likedByMe
                            ? "❤️"
                            : "♡"
                    }

                    <span class="comment-like-count">
                        ${commentLikes[commentId].count}
                    </span>
                `;

            }

        });

        console.log(
            "❤️ Comment like updated:",
            commentLikes[commentId]
        );

    } catch (error) {

        console.error(
            "❌ Comment like error:",
            error
        );

    }
}

function formatTime(dateString) {

    if (!dateString) {
        return "";
    }

    const date = new Date(dateString);
    const now = new Date();

    const seconds =
        Math.floor(
            (now - date) / 1000
        );

    if (seconds < 60) {
        return "Just now";
    }

    const minutes =
        Math.floor(seconds / 60);

    if (minutes < 60) {
        return `${minutes}m`;
    }

    const hours =
        Math.floor(minutes / 60);

    if (hours < 24) {
        return `${hours}h`;
    }

    const days =
        Math.floor(hours / 24);

    if (days < 7) {
        return `${days}d`;
    }

    return date.toLocaleDateString();
}

/* =========================================================
   SUBMIT COMMENT
========================================================= */

async function submitComment(event, postId) {

    event.preventDefault();

const input =
    document.getElementById(
        `commentInput-${postId}`
    );

    if (!input) return;

    const content =
        input.value.trim();

    if (!content) return;

    try {

        /* =====================================
           GET CURRENT USER
        ===================================== */

        const {
            data: { user },
            error: userError
        } =
            await supabaseClient
                .auth
                .getUser();

        if (userError) {
            throw userError;
        }

        if (!user) {

            alert(
                "Please login first."
            );

            return;
        }


        /* =====================================
           CHECK IF THIS IS A REPLY
        ===================================== */

        const parentId =
            replyingToComment &&
            replyingToComment.postId === postId
                ? replyingToComment.id
                : null;
console.log(
    "🧩 Comment submission:",
    {
        postId: postId,
        replyingToComment: replyingToComment,
        parentId: parentId
    }
);

        /* =====================================
           SAVE COMMENT / REPLY
        ===================================== */

        const {
            error
        } =
            await supabaseClient
                .from("post_comments")
                .insert({

                    post_id:
                        postId,

                    user_id:
                        user.id,

                    content:
                        content,

                    parent_id:
                        parentId

                });


        if (error) {
            throw error;
        }

// 🔔 Create comment / reply notification
try {

    let notificationUserId = null;

    /* =====================================
       💬 NORMAL COMMENT
    ===================================== */

    if (!parentId) {

        const {
            data: post,
            error: postError
        } = await supabaseClient
            .from("posts")
            .select("user_id")
            .eq("id", postId)
            .single();

        if (postError) {
            throw postError;
        }

        notificationUserId =
            post?.user_id || null;
    }


    /* =====================================
       ↩️ REPLY TO COMMENT
    ===================================== */
else {

    console.log(
        "↩️ Reply detected. Parent comment:",
        parentId
    );

    const {
        data: parentComment,
        error: parentError
    } = await supabaseClient
        .from("post_comments")
        .select("user_id")
        .eq("id", parentId)
        .single();

    if (parentError) {
        throw parentError;
    }

    console.log(
        "👤 Parent comment owner:",
        parentComment?.user_id
    );

    notificationUserId =
        parentComment?.user_id || null;

    console.log(
        "🔔 Reply notification target:",
        notificationUserId
    );
}

    /* =====================================
       🔔 SEND NOTIFICATION
    ===================================== */

    if (
        notificationUserId &&
        notificationUserId !== user.id
    ) {

        const {
            error: notificationError
        } = await supabaseClient
            .from("notifications")
            .insert({

                user_id:
                    notificationUserId,

                sender_id:
                    user.id,

                type:
                    parentId
                        ? "reply"
                        : "comment",

                post_id:
                    postId,

                comment_id:
                    parentId || null,

                message:
                    parentId
                        ? "replied to your comment"
                        : "commented on your post"

            });


        if (notificationError) {
            throw notificationError;
        }


        console.log(
            parentId
                ? "↩️ Reply notification created"
                : "💬 Comment notification created"
        );
    }

}
catch (notificationError) {

    console.error(
        "⚠️ Notification error:",
        notificationError
    );

}

        if (parentId) {

            console.log(
                "↩️ Reply added successfully"
            );

        } else {

            console.log(
                "💬 Comment added successfully"
            );

        }


        /* =====================================
           CLEAR INPUT
        ===================================== */

        input.value = "";


        /* =====================================
           CANCEL REPLY MODE
        ===================================== */

        if (parentId) {

            cancelReply(
                postId
            );

        }


        /* =====================================
           RELOAD COMMENTS
        ===================================== */

        await loadComments(
            postId
        );


        /* =====================================
           KEEP INPUT FOCUSED
        ===================================== */

        input.focus();


    } catch (error) {

        console.error(
            "❌ Comment error:",
            error
        );

        alert(
            "Could not add comment.\n\n" +
            (
                error.message ||
                "Please try again."
            )
        );

    }

}


/* =========================================================
   DELETE COMMENT
========================================================= */

async function deleteComment(
    commentId,
    postId
) {

    const confirmed =
        confirm(
            "Delete this comment?"
        );


    if (!confirmed) return;


    try {

        const {
            data: { user },
            error: userError
        } =
            await supabaseClient.auth.getUser();


        if (userError) {
            throw userError;
        }


        if (!user) {

            alert(
                "Please login first."
            );

            return;
        }


        /* =====================================
           DELETE ONLY OWN COMMENT
        ===================================== */

        const {
            error
        } =
            await supabaseClient
                .from("post_comments")
                .delete()
                .eq("id", commentId)
                .eq("user_id", user.id);


        if (error) {
            throw error;
        }


        console.log(
            "🗑️ Comment deleted"
        );


        /* =====================================
           RELOAD COMMENTS ONLY
        ===================================== */

        await loadComments(
            postId
        );

    } catch (error) {

        console.error(
            "❌ Delete comment error:",
            error
        );


        alert(
            "Could not delete comment.\n\n" +
            (
                error.message ||
                "Please try again."
            )
        );

    }

}


/* =========================================================
   SHARE
========================================================= */

async function sharePost(postId) {

    const url =
        window.location.href +
        "#post-" +
        postId;


    try {

        if (
            navigator.share
        ) {

            await navigator.share({

                title:
                    "FREE CHAT",

                text:
                    "Check out this post on FREE CHAT",

                url:
                    url

            });

        } else {

            await navigator.clipboard.writeText(
                url
            );

            alert(
                "🔗 Post link copied!"
            );

        }

    } catch (error) {

        console.log(
            "Share cancelled."
        );

    }

}


/* =========================================================
   SEARCH FEED
========================================================= */

function searchFeed() {

    const input =
        document.getElementById(
            "feedSearch"
        );


    if (!input) return;


    const query =
        input.value
            .trim()
            .toLowerCase();


    if (!query) {

        renderFeed(
            allFeedPosts
        );

        return;
    }


    const filtered =
        allFeedPosts.filter(post => {

            const content =
                (
                    post.content || ""
                ).toLowerCase();


            const username =
                (
                    post.profiles?.username ||
                    ""
                ).toLowerCase();


            return (
                content.includes(query) ||
                username.includes(query)
            );

        });


    renderFeed(
        filtered
    );

}

/* =========================================================
   OPEN POST IMAGE
========================================================= */

function openPostImage(url) {

    if (!url) return;

    const viewer =
        document.createElement("div");

    viewer.className =
        "post-image-viewer";

    viewer.innerHTML = `
        <button
            type="button"
            class="close-image-viewer"
        >
            ✕
        </button>

        <img
            src="${escapeHTML(url)}"
            alt="Post image"
        >
    `;

    viewer
        .querySelector(".close-image-viewer")
        .onclick = () => viewer.remove();

    viewer.onclick = function(event) {

        if (event.target === viewer) {
            viewer.remove();
        }

    };

    document.body.appendChild(viewer);
}

/* =========================================================
   REALTIME FEED
========================================================= */

let feedChannel = null;


function subscribeToFeed() {

    if (feedChannel) {

        supabaseClient
            .removeChannel(
                feedChannel
            );

    }


    feedChannel =
        supabaseClient
            .channel("free-chat-feed")
            .on(

                "postgres_changes",

                {
                    event: "*",
                    schema: "public",
                    table: "posts"
                },

                async () => {

                    console.log(
                        "📢 Feed updated"
                    );

                    await loadFeed();

                }
                )
            .subscribe();

}

/* OPEN NOTIFICATIONS */

async function openNotifications() {

    console.log("🔔 Opening notifications...");

    const screens = [
    "homeScreen",
    "contactsScreen",
    "friendsScreen",
    "chatScreen",
    "notificationsScreen",
    "settingsScreen",
    "privacySettingsScreen",
    "blockedUsersScreen",
    "mainMenuScreen",
    "profilePanel",
    "reelsScreen",
    "groupsScreen",
    "communityChatScreen"
];

    screens.forEach(id => {

        const screen =
            document.getElementById(id);

        if (screen) {
            screen.classList.add("hidden");
        }

    });


    const notificationScreen =
        document.getElementById("notificationsScreen");

    if (!notificationScreen) {

        console.error(
            "❌ notificationsScreen not found."
        );

        alert(
            "Notifications screen is missing."
        );

        return;
    }


    notificationScreen.classList.remove("hidden");


    if (
        typeof loadNotifications ===
        "function"
    ) {

        await loadNotifications();

    }


    console.log(
        "✅ Notifications opened."
    );
}

// =========================================================
// 🔔 NOTIFICATIONS
// =========================================================

async function loadNotifications() {
    try {
        // Check whether a login session exists
        const {
            data: { session },
            error: sessionError
        } = await supabaseClient.auth.getSession();

        if (sessionError) {
            console.error(
                "❌ Could not check login session:",
                sessionError.message
            );
            return;
        }

        // If the user is logged out, stop quietly
        if (!session) {
            console.log(
                "ℹ️ Notifications skipped: no active login session."
            );
            return;
        }

        const user = session.user;


        // =====================================================
        // 🔔 LOAD NOTIFICATIONS
        // =====================================================

        const {
            data: notifications,
            error
        } = await supabaseClient
            .from("notifications")
            .select(`
                id,
                user_id,
                sender_id,
                type,
                post_id,
                comment_id,
                friend_request_id,
                community_id,
                message,
                read,
                created_at
            `)
            .eq("user_id", user.id)
            .order("created_at", {
                ascending: false
            });


        if (error) {
            throw error;
        }


        // =====================================================
        // 👤 LOAD SENDER PROFILES
        // =====================================================

        const senderIds = [
            ...new Set(
                (notifications || [])
                    .map(notification => notification.sender_id)
                    .filter(Boolean)
            )
        ];


        let senderProfiles = {};


        if (senderIds.length > 0) {

            const {
                data: profiles,
                error: profilesError
            } = await supabaseClient
                .from("profiles")
                .select(`
                    id,
                    username,
                    avatar_url
                `)
                .in("id", senderIds);


            if (profilesError) {

                console.error(
                    "❌ Sender profiles error:",
                    profilesError
                );

            } else {

                (profiles || []).forEach(profile => {

                    senderProfiles[profile.id] = profile;

                });

            }

        }


        console.log(
            "🔔 Notifications loaded:",
            notifications
        );


        // =====================================================
        // 📋 NOTIFICATION LIST
        // =====================================================

        const list =
            document.getElementById(
                "notificationsList"
            );


        if (!list) {
            return;
        }


        // =====================================================
        // 🔔 NO NOTIFICATIONS
        // =====================================================

        if (
            !notifications ||
            notifications.length === 0
        ) {

            list.innerHTML = `
                <div class="notifications-loading">

                    🔔 No notifications yet.

                </div>
            `;


            updateNotificationBadges(0);

            return;
        }


        // =====================================================
        // 🎨 RENDER
        // =====================================================

        list.innerHTML = notifications
            .map(notification => {

                const sender =
                    senderProfiles[
                        notification.sender_id
                    ] || {};


                const username =
                    escapeHTML(
                        sender.username ||
                        "Someone"
                    );


                const avatar =
                    sender.avatar_url ||
                    "https://i.pravatar.cc/100?img=12";


                const unread =
                    !notification.read;


                // =================================================
                // 🔔 ICON
                // =================================================

                let notificationIcon = "🔔";


                if (
                    notification.type ===
                    "comment"
                ) {

                    notificationIcon = "💬";

                }


                if (
                    notification.type ===
                    "reply"
                ) {

                    notificationIcon = "↩️";

                }


                if (
                    notification.type ===
                    "like"
                ) {

                    notificationIcon = "❤️";

                }


                if (
                    notification.type ===
                    "friend_request"
                ) {

                    notificationIcon = "👤";

                }


                if (
                    notification.type ===
                    "message"
                ) {

                    notificationIcon = "💬";

                }

                if (
                    notification.type ===
                    "community_message"
                ) {

                    notificationIcon = "👥";

                }


                // =================================================
                // 👥 FRIEND REQUEST BUTTONS
                // =================================================

                let friendRequestActions = "";


                if (
                    notification.type ===
                        "friend_request" &&

                    notification.message ===
                        "sent you a friend request" &&

                    !notification.read &&

                    notification.friend_request_id
                ) {

                    friendRequestActions = `

                        <div
                            class="friend-request-actions"
                        >

                            <button
                                type="button"
                                class="accept-friend-btn"
                                onclick="
                                    event.stopPropagation();

                                    respondToFriendRequest(
                                        '${notification.friend_request_id}',
                                        '${notification.sender_id}',
                                        'accept'
                                    );

                                    setTimeout(
                                        loadNotifications,
                                        500
                                    );
                                "
                            >
                                ✓ Accept
                            </button>


                            <button
                                type="button"
                                class="reject-friend-btn"
                                onclick="
                                    event.stopPropagation();

                                    respondToFriendRequest(
                                        '${notification.friend_request_id}',
                                        '${notification.sender_id}',
                                        'reject'
                                    );

                                    setTimeout(
                                        loadNotifications,
                                        500
                                    );
                                "
                            >
                                ✕ Reject
                            </button>

                        </div>

                    `;

                }


                // =================================================
                // 📦 RETURN NOTIFICATION
                // =================================================

                return `

                    <div
                        class="notification-item
                        ${unread ? "unread" : ""}"
                        data-post-id="${
                            notification.post_id || ""
                        }"
                        onclick="
                            openNotification(
                                '${notification.id}',
                                '${notification.post_id || ""}',
                                '${notification.community_id || ""}'
                            )
                        "
                    >

                        <img
                            class="notification-avatar"
                            src="${escapeHTML(avatar)}"
                            alt="User"
                        >


                        <span
                            class="notification-icon"
                        >
                            ${notificationIcon}
                        </span>


                        <div
                            class="notification-content"
                        >

                            <div
                                class="notification-message"
                            >

                                <strong>
                                    ${username}
                                </strong>

                                <span
                                    class="notification-action"
                                >
                                    ${escapeHTML(
                                        notification.message
                                    )}
                                </span>

                            </div>


                            ${friendRequestActions}


                            <div
                                class="notification-time"
                            >

                                ${formatTime(
                                    notification.created_at
                                )}

                            </div>

                        </div>


                        ${
                            unread
                                ? `
                                    <span
                                        class="notification-dot"
                                    ></span>
                                  `
                                : ""
                        }

                    </div>

                `;

            })
            .join("");


        // =====================================================
        // 🔢 UNREAD COUNT
        // =====================================================

        const unreadCount =
            notifications.filter(
                notification =>
                    !notification.read
            ).length;


        updateNotificationBadges(
            unreadCount
        );


    } catch (error) {

        console.error(
            "❌ Notification loading failed:",
            error
        );

    }

}


// =========================================================
// 🔢 UPDATE NOTIFICATION BADGES
// =========================================================

function updateNotificationBadges(count) {

    const badges = [

        document.getElementById(
            "notificationBadge"
        ),

        document.getElementById(
            "bottomNotificationBadge"
        )

    ];


    badges.forEach(badge => {

        if (!badge) return;


        if (count > 0) {

            badge.textContent =
                count > 99
                    ? "99+"
                    : count;

            badge.classList.remove(
                "hidden"
            );

        } else {

            badge.classList.add(
                "hidden"
            );

        }

    });

}


/* =========================================================
   🔔 OPEN NOTIFICATIONS PAGE
========================================================= */

async function openNotification(
    notificationId,
    postId = "",
    communityId = ""
) {

    try {

        console.log(
            "🔔 Opening notification:",
            notificationId
        );


        const {
            data: { user },
            error: userError
        } =
            await supabaseClient.auth.getUser();


        if (userError)
            throw userError;


        if (!user) return;


        /*
        ==========================================
        ✅ MARK NOTIFICATION AS READ
        ==========================================
        */

        if (notificationId) {

            const {
                error
            } =
                await supabaseClient
                    .from("notifications")
                    .update({
                        read: true
                    })
                    .eq(
                        "id",
                        notificationId
                    )
                    .eq(
                        "user_id",
                        user.id
                    );

            if (error) {

                console.error(
                    "❌ Could not mark notification read:",
                    error
                );

            }

        }


        /*
        ==========================================
        👥 COMMUNITY MESSAGE NOTIFICATION
        ==========================================
        */

        if (communityId) {
            const communityScreen = document.getElementById("groupsScreen");
            const notificationScreen = document.getElementById("notificationsScreen");

            notificationScreen?.classList.add("hidden");
            communityScreen?.classList.remove("hidden");

            // Communities are loaded by the communities module when its screen opens.
            // If this community is already in memory, open its chat directly.
            if (
                typeof openCommunityChat === "function" &&
                typeof communities !== "undefined" &&
                Array.isArray(communities) &&
                communities.some(item => String(item.id) === String(communityId))
            ) {
                await openCommunityChat(communityId);
            } else {
                alert("Community notification marked as read. Open Communities and select the community to view the conversation.");
            }

            return;
        }

        /*
        ==========================================
        📰 POST NOTIFICATION
        ==========================================
        */

        if (postId) {

            closeNotifications();

            const post =
                document.querySelector(
                    `[data-post-id="${postId}"]`
                );

            if (post) {

                post.scrollIntoView({
                    behavior: "smooth",
                    block: "center"
                });

                post.style.outline =
                    "3px solid #ff6600";

                setTimeout(() => {

                    post.style.outline = "";

                }, 2000);

            }

            return;
        }


        /*
        ==========================================
        👥 FRIEND REQUEST
        ==========================================
        */

        closeNotifications();

        setTimeout(() => {

            openNotifications();

        }, 100);


    } catch (error) {

        console.error(
            "❌ openNotification error:",
            error
        );

    }

}


/* =========================================================
   🔔 CLOSE NOTIFICATIONS
========================================================= */

function closeNotifications() {

    const notifications =
        document.getElementById(
            "notificationsScreen"
        );

    const home =
        document.getElementById(
            "homeScreen"
        );


    if (notifications) {

        notifications.classList.add(
            "hidden"
        );

    }


    if (home) {

        home.classList.remove(
            "hidden"
        );

    }


    console.log(
        "🏠 Notifications closed."
    );

}


// 🔔 REAL-TIME NOTIFICATIONS
let notificationRealtimeChannel = null;
let notificationRealtimeUserId = null;
let notificationRealtimeStarting = false;
let notificationRealtimeRetryTimer = null;
let notificationRealtimeRetryDelay = 3000;
let notificationRealtimeRetryCount = 0;

function scheduleNotificationRealtimeRetry(channel, reason) {
    // Prevent retry storms: reserve the timer BEFORE removeChannel(), because
    // removing a channel can itself trigger a CLOSED callback.
    if (notificationRealtimeRetryTimer) return;

    if (notificationRealtimeChannel === channel) {
        notificationRealtimeChannel = null;
        notificationRealtimeUserId = null;
    }

    const delay = Math.min(notificationRealtimeRetryDelay, 30000);
    notificationRealtimeRetryDelay = Math.min(delay * 2, 30000);
    notificationRealtimeRetryCount += 1;

    console.warn(
        `🔁 Notification realtime reconnect scheduled in ${Math.round(delay / 1000)}s (attempt ${notificationRealtimeRetryCount}).`,
        reason || ""
    );

    // Reserve one retry slot immediately to ignore duplicate CLOSED callbacks.
    notificationRealtimeRetryTimer = setTimeout(() => {
        notificationRealtimeRetryTimer = null;
        startNotificationRealtime();
    }, delay);

    if (channel) {
        Promise.resolve(supabaseClient.removeChannel(channel)).catch(removeError => {
            console.warn("Could not remove failed notification channel:", removeError);
        });
    }
}
async function startNotificationRealtime() {
    if (notificationRealtimeStarting) {
        console.log("🔔 Notification realtime is already starting.");
        return;
    }

    if (notificationRealtimeRetryTimer) {
        return;
    }

    notificationRealtimeStarting = true;

    try {
        console.log("🔔 Starting notification realtime...");

        const {
            data: { session },
            error
        } = await supabaseClient.auth.getSession();

        if (error) {
            console.error("❌ Could not get session:", error);
            return;
        }

        const user = session?.user;

        if (!user) {
            console.log("⚠️ No active session. Realtime not started.");
            return;
        }

        if (
            notificationRealtimeChannel &&
            notificationRealtimeUserId === user.id
        ) {
            console.log("🔔 Notification realtime channel already exists.");
            return;
        }

        if (notificationRealtimeChannel) {
            const oldChannel = notificationRealtimeChannel;
            notificationRealtimeChannel = null;
            notificationRealtimeUserId = null;
            await supabaseClient.removeChannel(oldChannel);
        }

        const channel = supabaseClient
            .channel(`notifications-${user.id}`)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "notifications",
                    filter: `user_id=eq.${user.id}`
                },
                payload => {
                    console.log("🔔 NEW NOTIFICATION:", payload.new);

                    const button = document.querySelector(".notification-button");
                    if (button) {
                        button.classList.remove("notification-pulse");
                        void button.offsetWidth;
                        button.classList.add("notification-pulse");

                        setTimeout(() => {
                            button.classList.remove("notification-pulse");
                        }, 800);
                    }

                    if (typeof loadNotifications === "function") {
                        loadNotifications();
                    }
                }
            )
            .subscribe((status, err) => {
                console.log("🔔 Notification realtime status:", status);

                if (status === "SUBSCRIBED") {
                    notificationRealtimeRetryDelay = 3000;
                    notificationRealtimeRetryCount = 0;
                    console.log("✅ Notification realtime connected.");
                }

                if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
                    console.warn(
                        "⚠️ Notification realtime connection failed. This can be caused by network/WebSocket issues or Realtime not being enabled for the notifications table.",
                        err || "(Supabase did not provide error details)"
                    );
                    scheduleNotificationRealtimeRetry(channel, err || status);
                }

                if (status === "CLOSED") {
                    // A channel closed unexpectedly should be recreated.
                    scheduleNotificationRealtimeRetry(channel, "channel closed");
                }
            });

        notificationRealtimeChannel = channel;
        notificationRealtimeUserId = user.id;

    } catch (error) {
        console.error("❌ Notification realtime setup failed:", error);
        if (!notificationRealtimeRetryTimer) {
            notificationRealtimeRetryTimer = setTimeout(() => {
                notificationRealtimeRetryTimer = null;
                startNotificationRealtime();
            }, Math.min(notificationRealtimeRetryDelay, 30000));
            notificationRealtimeRetryDelay = Math.min(notificationRealtimeRetryDelay * 2, 30000);
        }
    } finally {
        notificationRealtimeStarting = false;
    }
}

/* ==========================================
   ⚙️ SETTINGS & PRIVACY ACTIONS
========================================== */



/* ONLINE STATUS */

function toggleOnlineStatus(toggle) {

    const online = toggle.checked;

    console.log(
        "🟢 Online status:",
        online
    );

    /*
       We will connect this to the
       profiles.online column so the
       setting persists after refresh.
    */

    alert(
        online
            ? "🟢 You are now showing as online."
            : "⚪ Your online status is hidden."
    );
}


/* NOTIFICATIONS */

function toggleNotifications(toggle) {

    const enabled = toggle.checked;

    console.log(
        "🔔 Notifications:",
        enabled
    );

    if (enabled) {

        alert(
            "🔔 Notifications enabled."
        );

    } else {

        alert(
            "🔕 Notifications disabled."
        );

    }
}

/* ==========================================
   💬 MESSAGE PRIVACY SETTINGS
========================================== */

async function openMessagePrivacy() {

    // Open the existing feature panel
    showFeaturePanel("message-privacy");

    document.getElementById("fcFeatureTitle").textContent =
        "💬 Message Privacy";

    document.getElementById("fcFeatureSubtitle").textContent =
        "Choose who can message you";

    const content = document.getElementById("fcFeatureContent");

    content.innerHTML = `
        <div class="fc-feature-row">
            <strong>🌍 Everyone</strong>
            <p>Anyone can message you.</p>
            <button type="button"
                class="fc-settings-save"
                id="fcMessageEveryone">
                Select Everyone
            </button>
        </div>

        <div class="fc-feature-row">
            <strong>👥 Friends</strong>
            <p>Only your friends can message you.</p>
            <button type="button"
                class="fc-settings-save"
                id="fcMessageFriends">
                Select Friends
            </button>
        </div>

        <div class="fc-feature-row">
            <strong>🔒 Nobody</strong>
            <p>Prevent anyone from starting a new conversation.</p>
            <button type="button"
                class="fc-settings-save"
                id="fcMessageNobody">
                Select Nobody
            </button>
        </div>

        <p id="fcMessagePrivacyStatus" role="status"></p>
    `;

    const status =
        document.getElementById("fcMessagePrivacyStatus");

    // Load the current saved preference
    try {
        const {
            data: { user },
            error: userError
        } = await supabaseClient.auth.getUser();

        if (userError) throw userError;

        if (!user) {
            status.textContent = "Please log in to manage message privacy.";
            return;
        }

        const { data, error } = await supabaseClient
            .from("profiles")
            .select("message_privacy")
            .eq("id", user.id)
            .single();

        if (error) throw error;

        const currentValue = data.message_privacy || "everyone";

        status.textContent =
            "Current setting: " +
            currentValue.replace("_", " ");

    } catch (error) {
        console.error("Could not load message privacy:", error);
        status.textContent =
            "Could not load your saved setting. Please try again.";
    }

    // Save the selected preference
    async function selectMessagePrivacy(value) {

        const buttons = [
            document.getElementById("fcMessageEveryone"),
            document.getElementById("fcMessageFriends"),
            document.getElementById("fcMessageNobody")
        ];

        buttons.forEach(button => {
            button.disabled = true;
        });

        status.textContent = "Saving...";

        try {
            const success =
                await savePrivacySetting("message_privacy", value);

            if (!success) {
                status.textContent =
                    "Your setting was not saved. Please try again.";
                return;
            }

            if (typeof currentPrivacySettings !== "undefined") {
                currentPrivacySettings.message_privacy = value;
            }

            if (typeof updatePrivacyUI === "function") {
                updatePrivacyUI();
            }

            status.textContent =
                "✅ Saved! Current setting: " +
                value.replace("_", " ");

        } catch (error) {
            console.error("Message privacy save failed:", error);
            status.textContent = "Could not save your setting.";
        } finally {
            buttons.forEach(button => {
                button.disabled = false;
            });
        }
    }

    document.getElementById("fcMessageEveryone")
        .addEventListener("click", () => selectMessagePrivacy("everyone"));

    document.getElementById("fcMessageFriends")
        .addEventListener("click", () => selectMessagePrivacy("friends"));

    document.getElementById("fcMessageNobody")
        .addEventListener("click", () => selectMessagePrivacy("nobody"));
}

/* SECURITY */

function openSecuritySettings() {
showFeaturePanel("security-settings");

document.getElementById("fcFeatureTitle").textContent =
    "🛡️ Account Security";

document.getElementById("fcFeatureSubtitle").textContent =
    "Protect your FREE CHAT account";

const content = document.getElementById("fcFeatureContent");

content.innerHTML = `
    <div class="fc-feature-row">
        <strong>🔐 Account Protection</strong>
        <p>Keep your account safe by using a strong, unique password.</p>
    </div>

    <div class="fc-feature-row">
        <strong>🔑 Change Password</strong>
        <p>Update your account password.</p>
        <button type="button"
            class="fc-settings-save"
            id="fcSecurityChangePassword">
            Change Password
        </button>
    </div>

    <div class="fc-feature-row">
        <strong>👁️ Profile Privacy</strong>
        <p>Manage who can see your profile and personal information.</p>
        <button type="button"
            class="fc-settings-save"
            id="fcSecurityPrivacy">
            Privacy Settings
        </button>
    </div>

    <div class="fc-feature-row">
        <strong>🚪 Sign Out</strong>
        <p>Sign out of your FREE CHAT account on this device.</p>
        <button type="button"
            class="fc-settings-save"
            id="fcSecurityLogout">
            Log Out
        </button>
    </div>
`;

document.getElementById("fcSecurityChangePassword")
    .addEventListener("click", () => {
        closeFeaturePanel();

        if (typeof openChangePassword === "function") {
            openChangePassword();
        } else {
            alert("Change Password is not connected yet.");
        }
    });

document.getElementById("fcSecurityPrivacy")
    .addEventListener("click", () => {
        closeFeaturePanel();

        if (typeof openPrivacySettings === "function") {
            openPrivacySettings();
        } else {
            alert("Privacy Settings are not connected yet.");
        }
    });

document.getElementById("fcSecurityLogout")
    .addEventListener("click", () => {
        closeFeaturePanel();

        if (typeof logoutFromSettings === "function") {
            logoutFromSettings();
        } else {
            alert("Logout is not connected yet.");
        }
    });

}


/* CHANGE PASSWORD */

async function changePassword() {

    const email =
        prompt(
            "Enter your account email to receive a password reset link:"
        );

    if (!email) return;


    try {

        const { error } =
            await supabaseClient.auth
                .resetPasswordForEmail(
                    email.trim()
                );

        if (error) throw error;


        alert(
            "📧 Password reset link sent.\n\n" +
            "Check your email."
        );


    } catch (error) {

        console.error(
            "❌ Password reset error:",
            error
        );

        alert(
            "Could not send password reset email.\n\n" +
            (error.message || "Please try again.")
        );

    }

}




// ==========================================
// 🔒 FREE CHAT — PRIVACY SETTINGS
// ==========================================

let currentPrivacySettings = {
    profile_visibility: "everyone",
    friend_request_privacy: "everyone",
    message_privacy: "everyone"
};





// ==========================================
// CLOSE PRIVACY SETTINGS
// ==========================================

function closePrivacySettings() {

    const privacy =
        document.getElementById("privacySettingsScreen");

    if (privacy) {
        privacy.classList.add("hidden");
    }

    const settings =
        document.getElementById("settingsScreen");

    if (settings) {
        settings.classList.remove("hidden");
    }

    console.log("⚙️ Privacy Settings closed.");
}


// ==========================================
// LOAD PRIVACY SETTINGS
// ==========================================

async function loadPrivacySettings() {

    try {

        const {
            data: {
                user
            },
            error: userError
        } = await supabaseClient.auth.getUser();

        if (userError) {
            throw userError;
        }

        if (!user) {
            console.error("❌ No logged-in user.");
            return;
        }


        const {
            data,
            error
        } = await supabaseClient
            .from("profiles")
            .select(`
                profile_visibility,
                friend_request_privacy,
                message_privacy
            `)
            .eq("id", user.id)
            .single();


        if (error) {
            throw error;
        }


        currentPrivacySettings = {

            profile_visibility:
                data.profile_visibility || "everyone",

            friend_request_privacy:
                data.friend_request_privacy || "everyone",

            message_privacy:
                data.message_privacy || "everyone"

        };


        updatePrivacyUI();


        console.log(
            "✅ Privacy settings loaded:",
            currentPrivacySettings
        );


    } catch (error) {

        console.error(
            "❌ Error loading privacy settings:",
            error
        );

        alert(
            "Could not load your privacy settings.\n\n" +
            (error.message || "Please try again.")
        );
    }
}


// ==========================================
// UPDATE PRIVACY UI
// ==========================================

function updatePrivacyUI() {

    // PROFILE

    const profileChecks = [
        "profileEveryoneCheck",
        "profileFriendsCheck",
        "profileOnlyMeCheck"
    ];

    profileChecks.forEach(id => {

        const element =
            document.getElementById(id);

        if (element) {
            element.style.visibility = "hidden";
        }

    });


    if (
        currentPrivacySettings.profile_visibility
        === "everyone"
    ) {

        const el =
            document.getElementById(
                "profileEveryoneCheck"
            );

        if (el) {
            el.style.visibility = "visible";
        }

    }


    if (
        currentPrivacySettings.profile_visibility
        === "friends"
    ) {

        const el =
            document.getElementById(
                "profileFriendsCheck"
            );

        if (el) {
            el.style.visibility = "visible";
        }

    }


    if (
        currentPrivacySettings.profile_visibility
        === "only_me"
    ) {

        const el =
            document.getElementById(
                "profileOnlyMeCheck"
            );

        if (el) {
            el.style.visibility = "visible";
        }

    }


    // FRIEND REQUESTS

    const requestChecks = [
        "requestEveryoneCheck",
        "requestFriendsCheck",
        "requestNobodyCheck"
    ];

    requestChecks.forEach(id => {

        const element =
            document.getElementById(id);

        if (element) {
            element.style.visibility = "hidden";
        }

    });


    if (
        currentPrivacySettings.friend_request_privacy
        === "everyone"
    ) {

        const el =
            document.getElementById(
                "requestEveryoneCheck"
            );

        if (el) {
            el.style.visibility = "visible";
        }

    }


    if (
        currentPrivacySettings.friend_request_privacy
        === "friends_of_friends"
    ) {

        const el =
            document.getElementById(
                "requestFriendsCheck"
            );

        if (el) {
            el.style.visibility = "visible";
        }

    }


    if (
        currentPrivacySettings.friend_request_privacy
        === "nobody"
    ) {

        const el =
            document.getElementById(
                "requestNobodyCheck"
            );

        if (el) {
            el.style.visibility = "visible";
        }

    }


    // MESSAGES

    const messageChecks = [
        "messageEveryoneCheck",
        "messageFriendsCheck",
        "messageNobodyCheck"
    ];

    messageChecks.forEach(id => {

        const element =
            document.getElementById(id);

        if (element) {
            element.style.visibility = "hidden";
        }

    });


    if (
        currentPrivacySettings.message_privacy
        === "everyone"
    ) {

        const el =
            document.getElementById(
                "messageEveryoneCheck"
            );

        if (el) {
            el.style.visibility = "visible";
        }

    }


    if (
        currentPrivacySettings.message_privacy
        === "friends"
    ) {

        const el =
            document.getElementById(
                "messageFriendsCheck"
            );

        if (el) {
            el.style.visibility = "visible";
        }

    }


    if (
        currentPrivacySettings.message_privacy
        === "nobody"
    ) {

        const el =
            document.getElementById(
                "messageNobodyCheck"
            );

        if (el) {
            el.style.visibility = "visible";
        }

    }
}


// ==========================================
// SAVE PRIVACY SETTING
// ==========================================

async function savePrivacySetting(
    column,
    value
) {

    try {

        const {
            data: {
                user
            },
            error: userError
        } = await supabaseClient.auth.getUser();


        if (userError) {
            throw userError;
        }


        if (!user) {

            alert(
                "Please login first."
            );

            return false;
        }


        const {
            error
        } = await supabaseClient
            .from("profiles")
            .update({
                [column]: value
            })
            .eq("id", user.id);


        if (error) {
            throw error;
        }


        console.log(
            `✅ ${column} changed to ${value}`
        );

        return true;


    } catch (error) {

        console.error(
            "❌ Privacy setting update error:",
            error
        );

        alert(
            "Could not save this setting.\n\n" +
            (error.message || "Please try again.")
        );

        return false;
    }
}

/* CLOSE MY PROFILE */

function closeProfile() {

    console.log("👤 Closing profile...");

    const profile =
        document.getElementById("profilePanel");

    if (profile) {
        profile.classList.add("hidden");
    }


    const home =
        document.getElementById("homeScreen");

    if (home) {
        home.classList.remove("hidden");
    }


    console.log(
        "🏠 Returned to home."
    );
}

// ==========================================
// PROFILE VISIBILITY
// ==========================================

async function chooseProfileVisibility(
    value
) {

    const success =
        await savePrivacySetting(
            "profile_visibility",
            value
        );


    if (!success) {
        return;
    }


    currentPrivacySettings.profile_visibility =
        value;


    updatePrivacyUI();


    console.log(
        "👤 Profile visibility:",
        value
    );
}


// ==========================================
// FRIEND REQUEST PRIVACY
// ==========================================

async function chooseFriendRequestPrivacy(
    value
) {

    const success =
        await savePrivacySetting(
            "friend_request_privacy",
            value
        );


    if (!success) {
        return;
    }


    currentPrivacySettings.friend_request_privacy =
        value;


    updatePrivacyUI();


    console.log(
        "🤝 Friend request privacy:",
        value
    );
}


// ==========================================
// MESSAGE PRIVACY
// ==========================================

async function chooseMessagePrivacy(
    value
) {

    const success =
        await savePrivacySetting(
            "message_privacy",
            value
        );


    if (!success) {
        return;
    }


    currentPrivacySettings.message_privacy =
        value;


    updatePrivacyUI();


    console.log(
        "💬 Message privacy:",
        value
    );
}

/* ==========================================
   🚫 BLOCKED USERS
========================================== */

let blockedUsersData = [];


/* ==========================================
   OPEN BLOCKED USERS
========================================== */

async function openBlockedUsers() {

    console.log("🚫 Opening Blocked Users...");

    const privacy =
        document.getElementById("privacySettingsScreen");

    const settings =
        document.getElementById("settingsScreen");

    const blocked =
        document.getElementById("blockedUsersScreen");

    if (!blocked) {

        console.error(
            "❌ blockedUsersScreen not found."
        );

        return;
    }

    if (privacy) {
        privacy.classList.add("hidden");
    }

    if (settings) {
        settings.classList.add("hidden");
    }

    blocked.classList.remove("hidden");

    await loadBlockedUsers();
}


/* ==========================================
   CLOSE BLOCKED USERS
========================================== */

function closeBlockedUsers() {

    const blocked =
        document.getElementById("blockedUsersScreen");

    const privacy =
        document.getElementById("privacySettingsScreen");

    if (blocked) {
        blocked.classList.add("hidden");
    }

    if (privacy) {
        privacy.classList.remove("hidden");
    }

}


/* ==========================================
   LOAD BLOCKED USERS
========================================== */

async function loadBlockedUsers() {

    const list =
        document.getElementById("blockedUsersList");

    const empty =
        document.getElementById("blockedUsersEmpty");

    if (!list) return;

    list.innerHTML = `
        <div class="blocked-users-loading">
            Loading blocked users...
        </div>
    `;

    if (empty) {
        empty.classList.add("hidden");
    }


    try {

        const {
            data: { user },
            error: userError
        } = await supabaseClient.auth.getUser();

        if (userError) {
            throw userError;
        }

        if (!user) {

            list.innerHTML = `
                <div class="blocked-users-loading">
                    Please login first.
                </div>
            `;

            return;
        }


        const {
            data,
            error
        } = await supabaseClient
            .from("blocked_users")
            .select(`
                id,
                blocked_id,
                created_at,
                profiles:blocked_id (
                    id,
                    username,
                    email,
                    avatar_url
                )
            `)
            .eq("blocker_id", user.id)
            .order("created_at", {
                ascending: false
            });


        if (error) {
            throw error;
        }


        blockedUsersData = data || [];


        if (blockedUsersData.length === 0) {

            list.innerHTML = "";

            if (empty) {
                empty.classList.remove("hidden");
            }

            return;
        }


        if (empty) {
            empty.classList.add("hidden");
        }

        renderBlockedUsers(blockedUsersData);


    } catch (error) {

        console.error(
            "❌ Failed to load blocked users:",
            error
        );

        list.innerHTML = `
            <div class="blocked-users-loading">
                ❌ Could not load blocked users.<br><br>
                ${escapeHTML(error.message || "Please try again.")}
            </div>
        `;

    }
}


/* ==========================================
   RENDER BLOCKED USERS
========================================== */

function renderBlockedUsers(users) {

    const list =
        document.getElementById("blockedUsersList");

    if (!list) return;


    if (!users || users.length === 0) {

        list.innerHTML = `
            <div class="blocked-users-loading">
                No matching blocked users.
            </div>
        `;

        return;
    }


    list.innerHTML = users.map(item => {

        const profile = item.profiles || {};

        const username =
            escapeHTML(
                profile.username || "Unknown user"
            );

        const avatar =
            profile.avatar_url ||
            "https://i.pravatar.cc/100?img=12";

        return `
            <div class="blocked-user-card">

                <img
                    class="blocked-user-avatar"
                    src="${escapeHTML(avatar)}"
                    alt="Profile"
                >

                <div class="blocked-user-info">

                    <strong>
                        ${username}
                    </strong>

                    <small>
                        Blocked user
                    </small>

                </div>

                <button
                    type="button"
                    class="unblock-user-btn"
                    onclick="unblockUser('${item.blocked_id}')"
                >
                    Unblock
                </button>

            </div>
        `;

    }).join("");

}

// ==========================================
// 🚫 BLOCK / UNBLOCK USER
// ==========================================

async function blockUser(userId) {

    if (!userId) return;

    try {

        const {
            data: { user },
            error: userError
        } = await supabaseClient.auth.getUser();

        if (userError) throw userError;

        if (!user) {
            alert("Please login first.");
            return;
        }

        if (user.id === userId) {
            alert("You cannot block yourself.");
            return;
        }


        /* ======================================
           ❓ CONFIRM BLOCK
        ====================================== */

        const confirmed = confirm(
            "Block this user?\n\n" +
            "They will not be able to message you or send you friend requests."
        );

        if (!confirmed) return;


        /* ======================================
           🚫 CHECK EXISTING BLOCK
        ====================================== */

        const {
            data: existingBlock,
            error: checkError
        } = await supabaseClient
            .from("blocked_users")
            .select("id")
            .eq("blocker_id", user.id)
            .eq("blocked_id", userId)
            .maybeSingle();

        if (checkError) throw checkError;


        if (existingBlock) {

            alert("🚫 This user is already blocked.");

            return;
        }


        /* ======================================
           🚫 CREATE BLOCK
        ====================================== */

        const {
            error: blockError
        } = await supabaseClient
            .from("blocked_users")
            .insert({
                blocker_id: user.id,
                blocked_id: userId
            });

        if (blockError) throw blockError;


        /* ======================================
           👥 REMOVE FRIENDSHIP
        ====================================== */

        const { error: friendshipError } =
            await supabaseClient
                .from("friends")
                .delete()
                .or(
                    `and(user_id.eq.${user.id},friend_id.eq.${userId}),and(user_id.eq.${userId},friend_id.eq.${user.id})`
                );

        if (friendshipError) {

            console.error(
                "⚠️ Could not remove friendship:",
                friendshipError
            );

        }


        /* ======================================
           🤝 REMOVE PENDING REQUESTS
        ====================================== */

        const { error: requestError } =
            await supabaseClient
                .from("friend_requests")
                .delete()
                .or(
                    `and(sender_id.eq.${user.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${user.id})`
                );

        if (requestError) {

            console.error(
                "⚠️ Could not remove friend request:",
                requestError
            );

        }


        /* ======================================
           🔄 REFRESH CURRENT SCREENS
        ====================================== */

        console.log(
            "🚫 User blocked:",
            userId
        );


        const blockedScreen =
            document.getElementById("blockedUsersScreen");

        if (
            blockedScreen &&
            !blockedScreen.classList.contains("hidden")
        ) {

            await loadBlockedUsers();

        }


        /* Refresh friends if available */

        if (typeof loadMyFriends === "function") {
            await loadMyFriends();
        }


        /* Refresh friend requests if available */

        if (typeof loadFriendRequests === "function") {
            await loadFriendRequests();
        }


        alert(
            "🚫 User blocked successfully."
        );


    } catch (error) {

        console.error(
            "❌ Block user error:",
            error
        );

        alert(
            "Could not block this user.\n\n" +
            (error.message || "Please try again.")
        );

    }

}


/* ==========================================
   🔓 UNBLOCK USER
========================================== */

async function unblockUser(blockedUserId) {

    if (!blockedUserId) return;


    const confirmed = confirm(
        "Unblock this user?\n\n" +
        "They will be able to interact with you again."
    );

    if (!confirmed) return;


    try {

        const {
            data: { user },
            error: userError
        } = await supabaseClient.auth.getUser();

        if (userError) throw userError;

        if (!user) {

            alert("Please login first.");

            return;
        }


        /* ======================================
           🔓 REMOVE BLOCK
        ====================================== */

        const {
            error
        } = await supabaseClient
            .from("blocked_users")
            .delete()
            .eq("blocker_id", user.id)
            .eq("blocked_id", blockedUserId);

        if (error) throw error;


        /* ======================================
           🔄 REFRESH BLOCKED USERS
        ====================================== */

        await loadBlockedUsers();


        /* Refresh suggestions/users */

        if (typeof loadUsers === "function") {
            await loadUsers();
        }


        alert(
            "✅ User unblocked."
        );


    } catch (error) {

        console.error(
            "❌ Unblock failed:",
            error
        );

        alert(
            "Could not unblock this user.\n\n" +
            (error.message || "Please try again.")
        );

    }

}

/* ==========================================
   SEARCH BLOCKED USERS
========================================== */

function searchBlockedUsers() {

    const input =
        document.getElementById("blockedUsersSearch");

    if (!input) return;


    const search =
        input.value
            .trim()
            .toLowerCase();


    if (!search) {

        renderBlockedUsers(
            blockedUsersData
        );

        return;
    }


    const filtered =
        blockedUsersData.filter(item => {

            const username =
                (
                    item.profiles?.username ||
                    ""
                ).toLowerCase();

            const email =
                (
                    item.profiles?.email ||
                    ""
                ).toLowerCase();

            return (
                username.includes(search) ||
                email.includes(search)
            );

        });


    renderBlockedUsers(filtered);

}
/* =====================================================
   💬 CHAT MENU + ATTACHMENTS + VOICE
===================================================== */


/* =====================================================
   ⋮ CHAT MORE MENU
===================================================== */

function toggleChatMoreMenu() {

    const menu =
        document.getElementById("chatMoreMenu");

    if (!menu) return;

    menu.classList.toggle("hidden");

}


/* =====================================================
   📎 ATTACHMENT MENU
===================================================== */

function toggleChatAttachmentMenu() {

    const menu =
        document.getElementById("chatAttachmentMenu");

    if (!menu) return;

    menu.classList.toggle("hidden");

}


/* =====================================================
   🚩 REPORT USER
===================================================== */

function reportChatUser() {

    const menu =
        document.getElementById("chatMoreMenu");

    if (menu) {
        menu.classList.add("hidden");
    }

    if (!currentChatUserId) {

        alert("No chat user selected.");

        return;
    }


    const confirmed = confirm(
        "Report this user?\n\n" +
        "The report feature will allow you to flag this account for review."
    );

    if (!confirmed) return;


    console.log(
        "🚩 User reported:",
        currentChatUserId
    );

    alert(
        "🚩 Report submitted.\n\n" +
        "Thank you for helping keep FREE CHAT safe."
    );
}


/* =====================================================
   🚫 BLOCK / UNBLOCK FROM CHAT
===================================================== */

async function toggleChatBlock() {

    const menu =
        document.getElementById("chatMoreMenu");

    if (menu) {
        menu.classList.add("hidden");
    }

    if (!currentChatUserId) {

        alert("No chat user selected.");

        return;
    }


    try {

        const {
            data: { user },
            error: userError
        } = await supabaseClient.auth.getUser();

        if (userError) throw userError;

        if (!user) {

            alert("Please login first.");

            return;
        }


        const {
            data: block,
            error
        } = await supabaseClient
            .from("blocked_users")
            .select("id")
            .eq("blocker_id", user.id)
            .eq("blocked_id", currentChatUserId)
            .maybeSingle();

        if (error) throw error;


        if (block) {

            await unblockUser(
                currentChatUserId
            );

        } else {

            await blockUser(
                currentChatUserId
            );

        }


        updateChatBlockButton();

    } catch (error) {

        console.error(
            "❌ Chat block toggle error:",
            error
        );

        alert(
            "Could not update block status.\n\n" +
            (error.message || "Please try again.")
        );

    }

}


/* =====================================================
   🔄 UPDATE BLOCK BUTTON
===================================================== */

async function updateChatBlockButton() {

    const button =
        document.getElementById("chatBlockButton");

    if (!button || !currentChatUserId) return;


    try {

        const {
            data: { user }
        } = await supabaseClient.auth.getUser();

        if (!user) return;


        const {
            data: block
        } = await supabaseClient
            .from("blocked_users")
            .select("id")
            .eq("blocker_id", user.id)
            .eq("blocked_id", currentChatUserId)
            .maybeSingle();


        const text =
            button.querySelector("span");


        if (block) {

            if (text) {
                text.textContent = "Unblock user";
            }

            button.querySelector(
                "span:first-child"
            );

        } else {

            if (text) {
                text.textContent = "Block user";
            }

        }

    } catch (error) {

        console.error(
            "❌ Block button update error:",
            error
        );

    }

}


/* =====================================================
   🗑️ CLEAR CHAT
===================================================== */

async function clearCurrentChat() {

    const menu =
        document.getElementById("chatMoreMenu");

    if (menu) {
        menu.classList.add("hidden");
    }


    if (!currentConversationId) {

        alert("No conversation selected.");

        return;
    }


    const confirmed = confirm(
        "Clear this chat?\n\n" +
        "This will remove the messages from this conversation."
    );

    if (!confirmed) return;


    try {

        const { error } =
            await supabaseClient
                .from("messages")
                .delete()
                .eq(
                    "conversation_id",
                    currentConversationId
                );

        if (error) throw error;


        const container =
            document.getElementById(
                "messagesContainer"
            );

        if (container) {

            container.innerHTML = `
                <div
                    class="no-messages"
                    id="noMessages"
                >
                    <div>💬</div>

                    <h3>
                        No messages yet
                    </h3>

                    <p>
                        Say hello 👋
                    </p>
                </div>
            `;

        }


        alert("🗑️ Chat cleared.");

    } catch (error) {

        console.error(
            "❌ Clear chat error:",
            error
        );

        alert(
            "Could not clear this chat.\n\n" +
            (error.message || "Please try again.")
        );

    }

}


/* =====================================================
   🖼️ PHOTO / VIDEO PICKER
===================================================== */

function openPhotoVideoPicker() {

    const menu =
        document.getElementById("chatAttachmentMenu");

    if (menu) {
        menu.classList.add("hidden");
    }


    const input =
        document.getElementById("chatMediaInput");

    if (input) {
        input.click();
    }

}


/* =====================================================
   📄 DOCUMENT PICKER
===================================================== */

function openDocumentPicker() {

    const menu =
        document.getElementById("chatAttachmentMenu");

    if (menu) {
        menu.classList.add("hidden");
    }


    const input =
        document.getElementById("chatDocumentInput");

    if (input) {
        input.click();
    }

}


// =====================================================
// 🖼️🎥 SEND CHAT PHOTO / VIDEO
// =====================================================

async function handleChatMediaSelected(event) {

    const files = Array.from(event.target.files || []);

    // Reset picker
    event.target.value = "";

    if (!files.length) return;

    if (!currentConversationId || !currentChatUserId) {

        alert("Please open a chat first.");

        return;
    }


    /* ==========================================
       REMEMBER CURRENT CHAT
    ========================================== */

    const chatUserId = currentChatUserId;
    const conversationId = currentConversationId;


    try {

        const {
            data: { user },
            error: userError
        } = await supabaseClient.auth.getUser();

        if (userError) throw userError;

        if (!user) {

            alert("Please login first.");

            return;
        }


        // Keep current user available
        currentUserId = user.id;


        /* ==========================================
           CHECK MESSAGE PERMISSION
        ========================================== */

        const permission =
            await canMessageUser(chatUserId);

        if (!permission.allowed) {

            alert(
                "🔒 Message unavailable\n\n" +
                permission.reason
            );

            return;
        }


        /* ==========================================
           UPLOAD EACH FILE
        ========================================== */

        for (const file of files) {

            const maxSize =
                50 * 1024 * 1024;


            if (file.size > maxSize) {

                alert(
                    `${file.name} is larger than 50 MB.`
                );

                continue;
            }


            /* ======================================
               MESSAGE TYPE
            ====================================== */

            let messageType = "document";

            if (file.type.startsWith("image/")) {

                messageType = "image";

            } else if (file.type.startsWith("video/")) {

                messageType = "video";

            }


            /* ======================================
               FILE EXTENSION
            ====================================== */

            const extension =
                file.name.includes(".")
                    ? file.name
                        .split(".")
                        .pop()
                        .toLowerCase()
                    : "file";


            /* ======================================
               STORAGE PATH
            ====================================== */

            const filePath =
                `chat/${conversationId}/${user.id}_${Date.now()}_${Math.random()
                    .toString(36)
                    .substring(2, 8)}.${extension}`;


            console.log(
                "⬆️ Uploading:",
                filePath
            );


            /* ======================================
               UPLOAD
            ====================================== */

            const {
                error: uploadError
            } = await supabaseClient
                .storage
                .from("chat-media")
                .upload(
                    filePath,
                    file,
                    {
                        cacheControl: "3600",
                        upsert: false,
                        contentType: file.type
                    }
                );


            if (uploadError) {

                console.error(
                    "❌ Upload error:",
                    uploadError
                );

                alert(
                    "Could not upload " +
                    file.name +
                    ".\n\n" +
                    uploadError.message
                );

                continue;
            }


            /* ======================================
               PUBLIC URL
            ====================================== */

            const {
                data: publicUrlData
            } = supabaseClient
                .storage
                .from("chat-media")
                .getPublicUrl(filePath);


            const mediaUrl =
                publicUrlData?.publicUrl;


            if (!mediaUrl) {

                alert(
                    "Could not create media URL."
                );

                continue;
            }


            /* ======================================
               INSERT MESSAGE
            ====================================== */

            const {
                data: message,
                error: messageError
            } = await supabaseClient
                .from("messages")
                .insert({

                    conversation_id:
                        conversationId,

                    sender_id:
                        user.id,

                    receiver_id:
                        chatUserId,

                    content:
                        file.name,

                    message_type:
                        messageType,

                    media_url:
                        mediaUrl,

                    file_name:
                        file.name,

                    file_size:
                        file.size,

                    mime_type:
                        file.type

                })
                .select()
                .single();


            if (messageError) {

                console.error(
                    "❌ Message insert error:",
                    messageError
                );

                alert(
                    "File uploaded, but the message could not be created."
                );

                continue;
            }


            console.log(
                "✅ Media message sent:",
                message
            );
        }


        /* ==========================================
           RESTORE CURRENT CHAT
        ========================================== */

        currentConversationId = conversationId;
        currentChatUserId = chatUserId;
        currentUserId = user.id;


        /* ==========================================
           MAKE SURE CHAT SCREEN IS VISIBLE
        ========================================== */

        const chatScreen =
            document.getElementById("chatScreen");

        const homeScreen =
            document.getElementById("homeScreen");

        if (homeScreen) {
            homeScreen.classList.add("hidden");
        }

        if (chatScreen) {
            chatScreen.classList.remove("hidden");
        }


        /* ==========================================
           REFRESH MESSAGES
        ========================================== */

        await loadMessages();


        /* ==========================================
           KEEP CHAT OPEN AFTER REFRESH
        ========================================== */

        if (chatScreen) {
            chatScreen.classList.remove("hidden");
        }

        if (homeScreen) {
            homeScreen.classList.add("hidden");
        }


        const messagesContainer =
            document.getElementById(
                "messagesContainer"
            );

        if (messagesContainer) {

            requestAnimationFrame(() => {

                messagesContainer.scrollTop =
                    messagesContainer.scrollHeight;

            });

        }


        console.log(
            "✅ Media sent — staying in chat."
        );


    } catch (error) {

        console.error(
            "❌ Media sending error:",
            error
        );

        alert(
            "Could not send media.\n\n" +
            (
                error.message ||
                "Please try again."
            )
        );


        /* ==========================================
           EVEN IF SOMETHING HAPPENS,
           RESTORE THE CHAT
        ========================================== */

        currentConversationId = conversationId;
        currentChatUserId = chatUserId;


        const chatScreen =
            document.getElementById("chatScreen");

        const homeScreen =
            document.getElementById("homeScreen");


        if (homeScreen) {
            homeScreen.classList.add("hidden");
        }

        if (chatScreen) {
            chatScreen.classList.remove("hidden");
        }

    }

}


/* =====================================================
   📄 SEND DOCUMENTS
===================================================== */

async function handleChatDocumentsSelected(event) {

    const files = Array.from(event.target.files || []);

    // Reset picker
    event.target.value = "";

    if (!files.length) return;

    if (!currentConversationId || !currentChatUserId) {
        alert("Please open a chat first.");
        return;
    }

    try {

        const {
            data: { user },
            error: userError
        } = await supabaseClient.auth.getUser();

        if (userError) throw userError;

        if (!user) {
            alert("Please login first.");
            return;
        }

        currentUserId = user.id;

        // 🔒 Check message permission
        const permission =
            await canMessageUser(currentChatUserId);

        if (!permission.allowed) {

            alert(
                "🔒 Message unavailable\n\n" +
                permission.reason
            );

            return;
        }

        // Save chat values before upload
        const chatUserId = currentChatUserId;
        const conversationId = currentConversationId;

        for (const file of files) {

            // 📦 Maximum document size: 50 MB
            const maxSize = 50 * 1024 * 1024;

            if (file.size > maxSize) {

                alert(
                    `${file.name} is larger than 50 MB.`
                );

                continue;
            }

            const extension =
                file.name.includes(".")
                    ? file.name
                        .split(".")
                        .pop()
                        .toLowerCase()
                    : "file";

            const filePath =
                `chat/${conversationId}/${user.id}_${Date.now()}_${Math.random()
                    .toString(36)
                    .substring(2, 8)}.${extension}`;

            console.log(
                "📄 Uploading document:",
                filePath
            );

            // ☁️ Upload document
            const {
                error: uploadError
            } = await supabaseClient
                .storage
                .from("chat-media")
                .upload(
                    filePath,
                    file,
                    {
                        cacheControl: "3600",
                        upsert: false,
                        contentType:
                            file.type ||
                            "application/octet-stream"
                    }
                );

            if (uploadError) {

                console.error(
                    "❌ Document upload error:",
                    uploadError
                );

                alert(
                    "Could not upload " +
                    file.name +
                    ".\n\n" +
                    uploadError.message
                );

                continue;
            }

            // 🔗 Create public URL
            const {
                data: publicUrlData
            } = supabaseClient
                .storage
                .from("chat-media")
                .getPublicUrl(filePath);

            const mediaUrl =
                publicUrlData?.publicUrl;

            if (!mediaUrl) {

                alert(
                    "Could not create document URL."
                );

                continue;
            }

            // 💬 Insert document message
            const {
                data: message,
                error: messageError
            } = await supabaseClient
                .from("messages")
                .insert({

                    conversation_id:
                        conversationId,

                    sender_id:
                        user.id,

                    receiver_id:
                        chatUserId,

                    content:
                        file.name,

                    message_type:
                        "document",

                    media_url:
                        mediaUrl,

                    file_name:
                        file.name,

                    file_size:
                        file.size,

                    mime_type:
                        file.type ||
                        "application/octet-stream"

                })
                .select()
                .single();

            if (messageError) {

                console.error(
                    "❌ Document message error:",
                    messageError
                );

                alert(
                    "Document uploaded, but the message could not be created."
                );

                continue;
            }

            console.log(
                "✅ Document sent:",
                message
            );
        }

        // 🔒 Restore chat
        currentConversationId =
            conversationId;

        currentChatUserId =
            chatUserId;

        currentUserId =
            user.id;

        // 🏠 Make sure we stay in chat
        const homeScreen =
            document.getElementById("homeScreen");

        const chatScreen =
            document.getElementById("chatScreen");

        if (homeScreen)
            homeScreen.classList.add("hidden");

        if (chatScreen)
            chatScreen.classList.remove("hidden");

        // 🔄 Reload messages
        await loadMessages();

        const container =
            document.getElementById(
                "messagesContainer"
            );

        if (container) {

            container.scrollTop =
                container.scrollHeight;
        }

    } catch (error) {

        console.error(
            "❌ Document sending error:",
            error
        );

        alert(
            "Could not send document.\n\n" +
            (error.message ||
                "Please try again.")
        );
    }
}

/* =====================================================
   📊 POLL CREATOR
===================================================== */

function openPollCreator() {

    const menu =
        document.getElementById("chatAttachmentMenu");

    if (menu) {
        menu.classList.add("hidden");
    }

    // Remove an existing creator if there is one
    const existing =
        document.getElementById("pollCreatorOverlay");

    if (existing) {
        existing.remove();
    }

    const overlay =
        document.createElement("div");

    overlay.id =
        "pollCreatorOverlay";

    overlay.className =
        "poll-creator-overlay";

    overlay.innerHTML = `

        <div class="poll-creator">

            <div class="poll-creator-header">

                <h2>📊 Create Poll</h2>

                <button
                    type="button"
                    onclick="closePollCreator()"
                    class="poll-close-button"
                >
                    ✕
                </button>

            </div>


            <div class="poll-creator-body">

                <label>
                    Question
                </label>

                <input
                    type="text"
                    id="pollQuestionInput"
                    placeholder="Ask a question..."
                    maxlength="200"
                    autocomplete="off"
                >


                <div class="poll-options-title">

                    <span>Options</span>

                </div>


                <div id="pollOptionsContainer">

                    <div class="poll-option-row">

                        <input
                            type="text"
                            class="poll-option-input"
                            placeholder="Option 1"
                            maxlength="100"
                        >

                    </div>


                    <div class="poll-option-row">

                        <input
                            type="text"
                            class="poll-option-input"
                            placeholder="Option 2"
                            maxlength="100"
                        >

                    </div>

                </div>


                <button
                    type="button"
                    class="poll-add-option"
                    onclick="addPollOption()"
                >
                    ＋ Add option
                </button>


                <button
                    type="button"
                    class="poll-create-button"
                    onclick="createChatPoll()"
                >
                    📊 Create Poll
                </button>

            </div>

        </div>

    `;

    document.body.appendChild(overlay);

    // Focus question
    setTimeout(() => {

        const input =
            document.getElementById(
                "pollQuestionInput"
            );

        if (input) {
            input.focus();
        }

    }, 100);
}


/* =====================================================
   ❌ CLOSE POLL CREATOR
===================================================== */

function closePollCreator() {

    const overlay =
        document.getElementById(
            "pollCreatorOverlay"
        );

    if (overlay) {
        overlay.remove();
    }
}


/* =====================================================
   ➕ ADD POLL OPTION
===================================================== */

function addPollOption() {

    const container =
        document.getElementById(
            "pollOptionsContainer"
        );

    if (!container) return;

    const currentOptions =
        container.querySelectorAll(
            ".poll-option-input"
        );

    if (currentOptions.length >= 10) {

        alert(
            "You can add up to 10 options."
        );

        return;
    }

    const number =
        currentOptions.length + 1;

    const row =
        document.createElement("div");

    row.className =
        "poll-option-row";

    row.innerHTML = `

        <input
            type="text"
            class="poll-option-input"
            placeholder="Option ${number}"
            maxlength="100"
        >

        <button
            type="button"
            class="poll-remove-option"
            onclick="this.parentElement.remove()"
        >
            ✕
        </button>

    `;

    container.appendChild(row);

    const input =
        row.querySelector(
            ".poll-option-input"
        );

    if (input) {
        input.focus();
    }
}


/* =====================================================
   📊 CREATE CHAT POLL
===================================================== */

async function createChatPoll() {

    if (
        !currentConversationId ||
        !currentChatUserId
    ) {

        alert(
            "Please open a chat first."
        );

        return;
    }


    const questionInput =
        document.getElementById(
            "pollQuestionInput"
        );

    const optionInputs =
        document.querySelectorAll(
            ".poll-option-input"
        );


    const question =
        questionInput?.value.trim();


    const options =
        Array.from(optionInputs)
            .map(input =>
                input.value.trim()
            )
            .filter(Boolean);


    if (!question) {

        alert(
            "Please enter a poll question."
        );

        questionInput?.focus();

        return;
    }


    if (options.length < 2) {

        alert(
            "Please add at least 2 options."
        );

        return;
    }


    if (options.length > 10) {

        alert(
            "You can have up to 10 options."
        );

        return;
    }


    // Prevent duplicate option names
    const uniqueOptions =
        [...new Set(
            options.map(
                option =>
                    option.toLowerCase()
            )
        )];


    if (
        uniqueOptions.length !==
        options.length
    ) {

        alert(
            "Poll options must be different."
        );

        return;
    }


    try {

        const {
            data: { user },
            error: userError
        } =
            await supabaseClient
                .auth
                .getUser();


        if (userError)
            throw userError;


        if (!user) {

            alert(
                "Please login first."
            );

            return;
        }


        currentUserId =
            user.id;


        // 🔒 Check chat permission
        const permission =
            await canMessageUser(
                currentChatUserId
            );


        if (!permission.allowed) {

            alert(
                "🔒 Message unavailable\n\n" +
                permission.reason
            );

            return;
        }


        const createButton =
            document.querySelector(
                ".poll-create-button"
            );


        if (createButton) {

            createButton.disabled =
                true;

            createButton.textContent =
                "Creating...";
        }


        // 1️⃣ Create poll
        const {
            data: poll,
            error: pollError
        } =
            await supabaseClient
                .from("chat_polls")
                .insert({

                    conversation_id:
                        currentConversationId,

                    creator_id:
                        user.id,

                    question:
                        question

                })
                .select()
                .single();


        if (pollError)
            throw pollError;


        // 2️⃣ Create options
        const optionRows =
            options.map(
                option => ({

                    poll_id:
                        poll.id,

                    option_text:
                        option

                })
            );


        const {
            data: createdOptions,
            error: optionsError
        } =
            await supabaseClient
                .from(
                    "chat_poll_options"
                )
                .insert(optionRows)
                .select();


        if (optionsError)
            throw optionsError;


const {
    error: messageError
} =
    await supabaseClient
        .from("messages")
        .insert({

            conversation_id:
                currentConversationId,

            sender_id:
                user.id,

            receiver_id:
                currentChatUserId,

            content:
                question,

            message_type:
                "poll",

            poll_id:
                poll.id

        });

        if (messageError)
            throw messageError;


        console.log(
            "📊 Poll created:",
            poll,
            createdOptions
        );


        closePollCreator();


        // 🔄 Reload chat
        await loadMessages();


        const container =
            document.getElementById(
                "messagesContainer"
            );


        if (container) {

            container.scrollTop =
                container.scrollHeight;

        }


    } catch (error) {

        console.error(
            "❌ Poll creation error:",
            error
        );


        alert(
            "Could not create poll.\n\n" +
            (
                error.message ||
                "Please try again."
            )
        );


        const createButton =
            document.querySelector(
                ".poll-create-button"
            );


        if (createButton) {

            createButton.disabled =
                false;

            createButton.textContent =
                "📊 Create Poll";
        }
    }
}

/* =====================================================
   👤 CONTACT PICKER
===================================================== */

async function openContactPicker() {

    const menu =
        document.getElementById(
            "chatAttachmentMenu"
        );

    if (menu) {
        menu.classList.add("hidden");
    }

    if (
        !currentConversationId ||
        !currentChatUserId
    ) {
        alert("Please open a chat first.");
        return;
    }

    const existing =
        document.getElementById(
            "contactPickerOverlay"
        );

    if (existing) {
        existing.remove();
    }

    const overlay =
        document.createElement("div");

    overlay.id =
        "contactPickerOverlay";

    overlay.className =
        "contact-picker-overlay";

    overlay.innerHTML = `

        <div class="contact-picker">

            <div class="contact-picker-header">

                <div>
                    <h2>👤 Share Contact</h2>
                    <p>Select a friend to share</p>
                </div>

                <button
                    type="button"
                    class="contact-close-button"
                    onclick="closeContactPicker()"
                >
                    ✕
                </button>

            </div>

            <div
                id="contactPickerList"
                class="contact-picker-list"
            >

                <div class="contact-picker-loading">
                    Loading contacts...
                </div>

            </div>

        </div>

    `;

    document.body.appendChild(overlay);

    await loadContactPickerUsers();
}

/* =====================================================
   👥 LOAD CONTACTS
===================================================== */

async function loadContactPickerUsers() {

    const container =
        document.getElementById(
            "contactPickerList"
        );

    if (!container) return;

    try {

        const {
            data: { user },
            error: authError
        } =
            await supabaseClient
                .auth
                .getUser();

        if (authError)
            throw authError;

        if (!user) {

            container.innerHTML = `
                <div class="contact-picker-loading">
                    Please login first.
                </div>
            `;

            return;
        }


        /* ---------------------------------------------
           GET MY FRIENDSHIPS
        --------------------------------------------- */

        const {
            data: friendships,
            error: friendsError
        } =
            await supabaseClient
                .from("friends")
                .select("friend_id")
                .eq(
                    "user_id",
                    user.id
                );


        if (friendsError)
            throw friendsError;


        const friendIds =
            (friendships || [])
                .map(
                    friendship =>
                        friendship.friend_id
                )
                .filter(Boolean);


        if (!friendIds.length) {

            container.innerHTML = `

                <div class="no-shared-contacts">

                    <div>👥</div>

                    <h3>No friends yet</h3>

                    <p>
                        Add friends before sharing
                        contacts.
                    </p>

                </div>

            `;

            return;
        }


        /* ---------------------------------------------
           GET FRIEND PROFILES
        --------------------------------------------- */

        const {
            data: contacts,
            error: contactsError
        } =
            await supabaseClient
                .from("profiles")
                .select(`
                    id,
                    username,
                    avatar_url,
                    online,
                    last_seen
                `)
                .in(
                    "id",
                    friendIds
                )
                .order(
                    "username",
                    {
                        ascending: true
                    }
                );


        if (contactsError)
            throw contactsError;


        if (
            !contacts ||
            contacts.length === 0
        ) {

            container.innerHTML = `
                <div class="no-shared-contacts">
                    No contacts available.
                </div>
            `;

            return;
        }


        /* ---------------------------------------------
           RENDER CONTACTS
        --------------------------------------------- */

        container.innerHTML =
            contacts.map(contact => {

                const avatar =
                    contact.avatar_url
                        ? escapeHTML(
                            contact.avatar_url
                        )
                        : "";


                const username =
                    escapeHTML(
                        contact.username ||
                        "FREE CHAT User"
                    );


                return `

                    <button
                        type="button"
                        class="share-contact-row"
                        onclick="shareContact(
                            '${contact.id}'
                        )"
                    >

                        <div class="share-contact-avatar">

                            ${
                                avatar
                                    ? `
                                        <img
                                            src="${avatar}"
                                            alt="${username}"
                                        >
                                      `
                                    : `
                                        <span>
                                            ${
                                                (
                                                    contact.username ||
                                                    "U"
                                                )
                                                .charAt(0)
                                                .toUpperCase()
                                            }
                                        </span>
                                      `
                            }

                        </div>


                        <div class="share-contact-info">

                            <strong>
                                ${username}
                            </strong>

                            <span>
                                ${
                                    contact.online
                                        ? "🟢 Online"
                                        : "Offline"
                                }
                            </span>

                        </div>


                        <div class="share-contact-arrow">
                            ›
                        </div>

                    </button>

                `;

            }).join("");


    } catch (error) {

        console.error(
            "❌ Contact picker error:",
            error
        );

        container.innerHTML = `

            <div class="contact-picker-loading">

                ⚠️ Could not load contacts.

                <br><br>

                ${escapeHTML(
                    error.message ||
                    "Please try again."
                )}

            </div>

        `;
    }
}

/* =====================================================
   ❌ CLOSE CONTACT PICKER
===================================================== */

function closeContactPicker() {

    const overlay =
        document.getElementById(
            "contactPickerOverlay"
        );

    if (overlay) {
        overlay.remove();
    }
}
/* =====================================================
   👤 SHARE CONTACT
===================================================== */

async function shareContact(contactId) {

    if (!contactId) return;


    try {

        const {
            data: { user },
            error: authError
        } =
            await supabaseClient
                .auth
                .getUser();

        if (authError)
            throw authError;

        if (!user) {

            alert("Please login first.");
            return;
        }


        currentUserId =
            user.id;


        /* ---------------------------------------------
           CHECK MESSAGE PERMISSION
        --------------------------------------------- */

        const permission =
            await canMessageUser(
                currentChatUserId
            );


        if (!permission.allowed) {

            alert(
                "🔒 Message unavailable\n\n" +
                permission.reason
            );

            return;
        }


        /* ---------------------------------------------
           GET CONTACT PROFILE
        --------------------------------------------- */

        const {
            data: contact,
            error: contactError
        } =
            await supabaseClient
                .from("profiles")
                .select(`
                    id,
                    username
                `)
                .eq(
                    "id",
                    contactId
                )
                .single();


        if (contactError)
            throw contactError;


        if (!contact) {

            alert(
                "Contact could not be found."
            );

            return;
        }


        /* ---------------------------------------------
           SEND CONTACT MESSAGE
        --------------------------------------------- */

        const {
            error: messageError
        } =
            await supabaseClient
                .from("messages")
                .insert({

                    conversation_id:
                        currentConversationId,

                    sender_id:
                        user.id,

                    receiver_id:
                        currentChatUserId,

                    content:
                        contact.username ||
                        "FREE CHAT User",

                    message_type:
                        "contact",

                    contact_id:
                        contact.id

                });


        if (messageError)
            throw messageError;


        console.log(
            "✅ Contact shared:",
            contact.username
        );


        closeContactPicker();


        /* ---------------------------------------------
           REFRESH CHAT
        --------------------------------------------- */

        await loadMessages();


        const container =
            document.getElementById(
                "messagesContainer"
            );


        if (container) {

            container.scrollTop =
                container.scrollHeight;

        }


    } catch (error) {

        console.error(
            "❌ Contact sharing error:",
            error
        );

        alert(
            "Could not share contact.\n\n" +
            (
                error.message ||
                "Please try again."
            )
        );
    }
}

/* =====================================================
   🎙️ VOICE MESSAGE
===================================================== */

let voiceRecorder = null;
let voiceChunks = [];
let voiceStream = null;
let voiceRecordingTimer = null;
let voiceRecordingSeconds = 0;


/* =====================================================
   🎙️ START RECORDING
===================================================== */

async function startVoiceRecording() {

    if (
        !currentConversationId ||
        !currentChatUserId
    ) {
        alert("Please open a chat first.");
        return;
    }

    try {

        const {
            data: { user },
            error: authError
        } =
            await supabaseClient
                .auth
                .getUser();

        if (authError)
            throw authError;

        if (!user) {
            alert("Please login first.");
            return;
        }


        /* Check message permission */

        const permission =
            await canMessageUser(
                currentChatUserId
            );

        if (!permission.allowed) {

            alert(
                "🔒 Message unavailable\n\n" +
                permission.reason
            );

            return;
        }


        voiceStream =
            await navigator.mediaDevices
                .getUserMedia({
                    audio: true
                });


        voiceChunks = [];


        let mimeType = "";

        if (
            MediaRecorder.isTypeSupported(
                "audio/webm;codecs=opus"
            )
        ) {

            mimeType =
                "audio/webm;codecs=opus";

        } else if (
            MediaRecorder.isTypeSupported(
                "audio/webm"
            )
        ) {

            mimeType =
                "audio/webm";

        }


        voiceRecorder =
            mimeType
                ? new MediaRecorder(
                    voiceStream,
                    { mimeType }
                )
                : new MediaRecorder(
                    voiceStream
                );


        voiceRecorder.ondataavailable =
            event => {

                if (
                    event.data &&
                    event.data.size > 0
                ) {

                    voiceChunks.push(
                        event.data
                    );

                }

            };


        voiceRecorder.onstop =
            async () => {

                const finalMimeType =
                    voiceRecorder.mimeType ||
                    mimeType ||
                    "audio/webm";


                const audioBlob =
                    new Blob(
                        voiceChunks,
                        {
                            type:
                                finalMimeType
                        }
                    );


                cleanupVoiceRecording();


                if (
                    audioBlob.size === 0
                ) {

                    alert(
                        "No voice recording was captured."
                    );

                    return;
                }


                await sendVoiceMessage(
                    audioBlob,
                    finalMimeType
                );

            };


        voiceRecorder.onerror =
            event => {

                console.error(
                    "❌ Voice recorder error:",
                    event.error
                );

                cleanupVoiceRecording();

                alert(
                    "Voice recording failed."
                );

            };


        voiceRecorder.start(
            200
        );


        voiceRecordingSeconds = 0;


        showVoiceRecordingUI();


        voiceRecordingTimer =
            setInterval(
                () => {

                    voiceRecordingSeconds++;

                    updateVoiceRecordingTimer();

                },
                1000
            );


        console.log(
            "🎙️ Voice recording started."
        );


    } catch (error) {

        console.error(
            "❌ Microphone error:",
            error
        );


        if (
            error.name ===
            "NotAllowedError"
        ) {

            alert(
                "🎙️ Microphone permission was denied.\n\n" +
                "Please allow microphone access for FREE CHAT."
            );

        } else {

            alert(
                "Could not access your microphone.\n\n" +
                (
                    error.message ||
                    "Please try again."
                )
            );

        }

    }
}


/* =====================================================
   ⏹️ STOP RECORDING
===================================================== */

function stopVoiceRecording() {

    if (
        !voiceRecorder ||
        voiceRecorder.state ===
        "inactive"
    ) {
        return;
    }


    console.log(
        "⏹️ Stopping voice recording..."
    );


    voiceRecorder.stop();

}


/* =====================================================
   ❌ CANCEL RECORDING
===================================================== */

function cancelVoiceRecording() {

    if (
        voiceRecorder &&
        voiceRecorder.state !==
        "inactive"
    ) {

        voiceRecorder.onstop = null;

        voiceRecorder.stop();

    }


    cleanupVoiceRecording();


    console.log(
        "❌ Voice recording cancelled."
    );
}


/* =====================================================
   🧹 CLEANUP
===================================================== */

function cleanupVoiceRecording() {

    if (voiceRecordingTimer) {

        clearInterval(
            voiceRecordingTimer
        );

        voiceRecordingTimer = null;

    }


    if (voiceStream) {

        voiceStream
            .getTracks()
            .forEach(
                track =>
                    track.stop()
            );

        voiceStream = null;

    }


    voiceRecorder = null;

    voiceChunks = [];

    voiceRecordingSeconds = 0;


    hideVoiceRecordingUI();
}


/* =====================================================
   ⏱️ TIMER
===================================================== */

function updateVoiceRecordingTimer() {

    const timer =
        document.getElementById(
            "voiceRecordingTimer"
        );

    if (!timer) return;


    const minutes =
        Math.floor(
            voiceRecordingSeconds / 60
        )
        .toString()
        .padStart(2, "0");


    const seconds =
        (
            voiceRecordingSeconds % 60
        )
        .toString()
        .padStart(2, "0");


    timer.textContent =
        `${minutes}:${seconds}`;
}


/* =====================================================
   🎙️ RECORDING UI
===================================================== */

function showVoiceRecordingUI() {

    const bar =
        document.getElementById(
            "voiceRecordingBar"
        );

    if (bar) {

        bar.classList.remove(
            "hidden"
        );

    }


    const mic =
        document.getElementById(
            "chatMicButton"
        );

    if (mic) {

        mic.classList.add(
            "recording"
        );

    }


    updateVoiceRecordingTimer();
}


function hideVoiceRecordingUI() {

    const bar =
        document.getElementById(
            "voiceRecordingBar"
        );

    if (bar) {

        bar.classList.add(
            "hidden"
        );

    }


    const mic =
        document.getElementById(
            "chatMicButton"
        );

    if (mic) {

        mic.classList.remove(
            "recording"
        );

    }

}


/* =====================================================
   ☁️ SEND VOICE MESSAGE
===================================================== */

async function sendVoiceMessage(
    audioBlob,
    mimeType
) {

    try {

        const {
            data: { user },
            error: authError
        } =
            await supabaseClient
                .auth
                .getUser();


        if (authError)
            throw authError;


        if (!user) {

            alert(
                "Please login first."
            );

            return;
        }


        const permission =
            await canMessageUser(
                currentChatUserId
            );


        if (!permission.allowed) {

            alert(
                "🔒 Message unavailable\n\n" +
                permission.reason
            );

            return;
        }


        /* ---------------------------------------------
           FILE NAME
        --------------------------------------------- */

        const extension =
            mimeType.includes(
                "webm"
            )
                ? "webm"
                : "audio";


        const fileName =
            `${user.id}_${Date.now()}.${extension}`;


        const filePath =
            `chat/${currentConversationId}/voice/${fileName}`;


        console.log(
            "⬆️ Uploading voice:",
            filePath
        );


        /* ---------------------------------------------
           UPLOAD
        --------------------------------------------- */

        const {
            error: uploadError
        } =
            await supabaseClient
                .storage
                .from("chat-media")
                .upload(
                    filePath,
                    audioBlob,
                    {
                        cacheControl:
                            "3600",

                        upsert:
                            false,

                        contentType:
                            mimeType
                    }
                );


        if (uploadError)
            throw uploadError;


        /* ---------------------------------------------
           PUBLIC URL
        --------------------------------------------- */

        const {
            data: publicUrlData
        } =
            supabaseClient
                .storage
                .from("chat-media")
                .getPublicUrl(
                    filePath
                );


        const mediaUrl =
            publicUrlData?.publicUrl;


        if (!mediaUrl) {

            throw new Error(
                "Could not create audio URL."
            );

        }


        /* ---------------------------------------------
           SAVE MESSAGE
        --------------------------------------------- */

        const {
            data: message,
            error: messageError
        } =
            await supabaseClient
                .from("messages")
                .insert({

                    conversation_id:
                        currentConversationId,

                    sender_id:
                        user.id,

                    receiver_id:
                        currentChatUserId,

                    content:
                        "🎙️ Voice message",

                    message_type:
                        "audio",

                    media_url:
                        mediaUrl,

                    file_name:
                        fileName,

                    file_size:
                        audioBlob.size,

                    mime_type:
                        mimeType

                })
                .select()
                .single();


        if (messageError)
            throw messageError;


        console.log(
            "✅ Voice message sent:",
            message
        );


        await loadMessages();


    } catch (error) {

        console.error(
            "❌ Voice message error:",
            error
        );


        alert(
            "Could not send voice message.\n\n" +
            (
                error.message ||
                "Please try again."
            )
        );

    }
}

/* =====================================================
   🔄 UPDATE CHAT MENU WHEN CHAT OPENS
===================================================== */

async function refreshChatMenus() {

    const moreMenu =
        document.getElementById("chatMoreMenu");

    if (moreMenu) {
        moreMenu.classList.add("hidden");
    }

    const attachmentMenu =
        document.getElementById("chatAttachmentMenu");

    if (attachmentMenu) {
        attachmentMenu.classList.add("hidden");
    }

    await updateChatBlockButton();

}
function previewReelVideo(event) {
    console.log("🎬 Video selection event fired!");

    const input = event.target;
    const file = input.files && input.files[0];

    if (!file) {
        console.log("No video file was selected.");
        return;
    }

    console.log("Selected video:", file.name);
    console.log("Video type:", file.type);
    console.log("Video size:", file.size);

    const preview = document.getElementById("reelVideoPreview");
    const container = document.getElementById("reelPreviewContainer");
    const status = document.getElementById("reelUploadStatus");

    if (!preview || !container || !status) {
        alert("Reels preview elements are missing.");
        console.error("Missing preview element:", {
            preview: !!preview,
            container: !!container,
            status: !!status
        });
        return;
    }

    if (!file.type.startsWith("video/")) {
        alert("Please select a video file.");
        input.value = "";
        return;
    }

    if (file.size > 50 * 1024 * 1024) {
        alert("Your video must be smaller than 50 MB.");
        input.value = "";
        return;
    }

    if (preview.dataset.previewUrl) {
        URL.revokeObjectURL(preview.dataset.previewUrl);
    }

    const videoURL = URL.createObjectURL(file);

    preview.src = videoURL;
    preview.dataset.previewUrl = videoURL;
    container.hidden = false;
    status.textContent = "✅ Video ready! Press Upload Reel to continue.";

    preview.load();

    console.log("✅ Video preview displayed.");
}
// FREE CHAT REELS: BUTTON CONNECTIONS
(function connectReelsButtons() {
    function setupReels() {
        const input = document.getElementById("reelVideoInput");
        const chooseButton = document.getElementById("selectReelVideoBtn");
        const backButton = document.getElementById("reelsBackBtn");
        const publishButton = document.getElementById("publishReelBtn");

        if (!input || !chooseButton || !backButton || !publishButton) {
            console.warn("Reels elements not found yet.");
            return;
        }

        chooseButton.onclick = function () {
            input.click();
        };

        input.onchange = function (event) {
            previewReelVideo(event);
        };

        backButton.onclick = function () {
            const reels = document.getElementById("reelsScreen");
            if (reels) reels.classList.add("hidden");

            if (typeof showHome === "function") {
                showHome();
            }
        };

        publishButton.onclick = function () {
            if (typeof uploadReelVideo === "function") {
                uploadReelVideo();
            } else {
                alert("The upload function is not available yet.");
            }
        };
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", setupReels);
    } else {
        setupReels();
    }
})();
// ========================================
// FREE CHAT REELS UPLOAD
// ========================================

window.uploadReelVideo = async function () {
    const input = document.getElementById("reelVideoInput");
    const captionInput = document.getElementById("reelCaption");
    const status = document.getElementById("reelUploadStatus");
    const button = document.getElementById("publishReelBtn");
    const preview = document.getElementById("reelVideoPreview");

    const file = input?.files?.[0];

    if (!file) {
        alert("Please choose a video first.");
        return;
    }

    if (file.size > 50 * 1024 * 1024) {
        alert("Your video must be smaller than 50 MB.");
        return;
    }

    if (typeof supabaseClient === "undefined") {
        alert("Supabase is not loaded. Check supabase.js.");
        return;
    }

    if (button) {
        button.disabled = true;
        button.textContent = "Uploading...";
    }

    if (status) status.textContent = "Uploading your Reel...";

    let uploadedPath = null;

    try {
        const {
            data: { user },
            error: authError
        } = await supabaseClient.auth.getUser();

        if (authError) throw authError;

        if (!user) {
            throw new Error("Please sign in before uploading a Reel.");
        }
console.log("FREE CHAT user ID:", user.id);
console.log("FREE CHAT session:", await supabaseClient.auth.getSession());
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const filePath =
            user.id + "/" + Date.now() + "_" + safeName;

        const { data: uploaded, error: uploadError } =
            await supabaseClient.storage
                .from("reels")
                .upload(filePath, file, {
                    contentType: file.type,
                    cacheControl: "3600",
                    upsert: false
                });

        if (uploadError) throw uploadError;

        uploadedPath = uploaded.path;

        const { data: publicData } = supabaseClient.storage
            .from("reels")
            .getPublicUrl(uploaded.path);

        const { error: saveError } = await supabaseClient
            .from("reels")
            .insert({
                user_id: user.id,
                video_url: publicData.publicUrl,
                caption: captionInput?.value?.trim() || ""
            });

        if (saveError) throw saveError;

        
if (status) {
    status.textContent = "✅ Your Reel was published!";
}

// Clear the upload form and preview.
if (input) input.value = "";
if (captionInput) captionInput.value = "";

const previewContainer =
    document.getElementById("reelPreviewContainer");

if (preview) {
    preview.pause();
    preview.removeAttribute("src");
    preview.load();
}

if (previewContainer) {
    previewContainer.hidden = true;
}

// Refresh the Reels feed.
if (typeof window.loadReelsFeed === "function") {
    await window.loadReelsFeed();
}

// Open the Reels screen.
const screensToHide = [
    "homeScreen",
    "contactsScreen",
    "friendsScreen",
    "chatScreen",
    "notificationsScreen",
    "settingsScreen",
    "privacySettingsScreen",
    "blockedUsersScreen",
    "mainMenuScreen",
    "profilePanel",
    "userProfileScreen"
];

screensToHide.forEach(function (id) {
    const screen = document.getElementById(id);
    if (screen) screen.classList.add("hidden");
});

const reelsScreen = document.getElementById("reelsScreen");

if (reelsScreen) {
    reelsScreen.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
} else {
    console.error("Reels screen was not found.");
}

// Show confirmation after the feed refresh.
alert("✅ Your Reel was published successfully!");

    } catch (error) {
        console.error("Reel upload error:", error);

        // Remove the uploaded file if saving its database record failed.
        if (uploadedPath) {
            const { error: cleanupError } =
                await supabaseClient.storage
                    .from("reels")
                    .remove([uploadedPath]);

            if (cleanupError) {
                console.warn("Could not clean up uploaded video:", cleanupError);
            }
        }

        if (status) {
            status.textContent = "Upload failed: " + error.message;
        }

        alert("Reel upload failed: " + error.message);

    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = "⬆️ Upload Reel";
        }
    }
};

window.loadReelsFeed = async function () {
    const feed = document.getElementById("reelsFeed");
    if (!feed) return;

    feed.innerHTML = "<p>⏳ Loading Reels...</p>";

    try {
        const { data: reels, error } = await supabaseClient
            .from("reels")
            .select("id, user_id, video_url, caption, created_at")
            .order("created_at", { ascending: false });

        if (error) throw error;

const creatorIds = [
    ...new Set((reels || []).map(reel => reel.user_id).filter(Boolean))
];

let creatorProfiles = {};

if (creatorIds.length > 0) {
    const { data: profiles, error: profilesError } =
        await supabaseClient
            .from("profiles")
            .select("id, username, avatar_url")
            .in("id", creatorIds);

    if (profilesError) throw profilesError;

    (profiles || []).forEach(profile => {
        creatorProfiles[profile.id] = profile;
    });
}

        if (!reels || !reels.length) {
            feed.innerHTML = `
                <div class="reels-empty-state">
                    <h3>🎬 FREE CHAT Reels</h3>
                    <p>No Reels yet. Be the first to share!</p>
                </div>`;
            return;
        }

        const { data: authData, error: authError } =
            await supabaseClient.auth.getUser();

        if (authError) throw authError;

        const user = authData.user;

        // Load existing likes and comments in batches.
        const { data: allLikes, error: likesError } =
            await supabaseClient
                .from("reel_likes")
                .select("reel_id, user_id");

        if (likesError) throw likesError;

        const { data: allComments, error: commentsError } =
            await supabaseClient
                .from("reel_comments")
                .select("id, reel_id, user_id, content, created_at")
                .order("created_at", { ascending: true });

        if (commentsError) throw commentsError;

        feed.innerHTML = "";

        reels.forEach(function (reel) {
            const likes = (allLikes || []).filter(
                item => item.reel_id === reel.id
            );

            const comments = (allComments || []).filter(
                item => item.reel_id === reel.id
            );

            const liked = !!user && likes.some(
                item => item.user_id === user.id
            );

            const card = document.createElement("article");
            card.className = "reel-card";

const creator = creatorProfiles[reel.user_id] || {};

const creatorHeader = document.createElement("div");
creatorHeader.style.cssText =
    "display:flex;align-items:center;gap:10px;padding:10px 0;";

const creatorAvatar = document.createElement("img");
creatorAvatar.src =
    creator.avatar_url || "https://i.pravatar.cc/100?img=12";
creatorAvatar.alt = creator.username || "FREE CHAT USER";
creatorAvatar.style.cssText =
    "width:42px;height:42px;border-radius:50%;object-fit:cover;cursor:pointer;";

const creatorName = document.createElement("button");
creatorName.type = "button";
creatorName.textContent = "👤 " + (creator.username || "FREE CHAT USER");
creatorName.style.cssText =
    "background:none;border:0;color:inherit;font-weight:bold;cursor:pointer;";

creatorName.addEventListener("click", function () {
    openUserProfile(reel.user_id);
});

creatorAvatar.addEventListener("click", function () {
    openUserProfile(reel.user_id);
});

const followButton = document.createElement("button");
followButton.type = "button";
followButton.textContent = "Loading...";
followButton.disabled = true;
followButton.dataset.following = "false";

followButton.style.cssText =
    "margin-left:auto;padding:7px 12px;border:0;border-radius:8px;background:#2864e8;color:white;cursor:pointer;";

// Load the saved follow status for this creator
async function loadReelFollowStatus() {
    try {
        const { data: { user }, error: authError } =
            await supabaseClient.auth.getUser();

        if (authError) throw authError;

        if (!user) {
            followButton.textContent = "➕ Follow";
            followButton.dataset.following = "false";
            followButton.disabled = false;
            return;
        }

        if (user.id === reel.user_id) {
            followButton.hidden = true;
            return;
        }

        const { data: existingFollow, error } =
            await supabaseClient
                .from("user_follows")
                .select("follower_id")
                .eq("follower_id", user.id)
                .eq("following_id", reel.user_id)
                .maybeSingle();

        if (error) throw error;

        followButton.dataset.following =
            existingFollow ? "true" : "false";

        followButton.textContent =
            existingFollow ? " Following" : "➕ Follow";

    } catch (error) {
        console.error("Could not load Reel follow status:", error);
        followButton.textContent = "Retry";
    } finally {
        followButton.disabled = false;
    }
}

followButton.addEventListener("click", async function () {
    try {
        followButton.disabled = true;

        const { data: { user }, error: authError } =
            await supabaseClient.auth.getUser();

        if (authError) throw authError;

        if (!user) {
            alert("Please sign in to follow creators.");
            return;
        }

        if (user.id === reel.user_id) {
            alert("You cannot follow yourself!");
            return;
        }

        const { data: existingFollow, error: checkError } =
            await supabaseClient
                .from("user_follows")
                .select("follower_id")
                .eq("follower_id", user.id)
                .eq("following_id", reel.user_id)
                .maybeSingle();

        if (checkError) throw checkError;

        if (existingFollow) {
            const { error } = await supabaseClient
                .from("user_follows")
                .delete()
                .eq("follower_id", user.id)
                .eq("following_id", reel.user_id);

            if (error) throw error;
        } else {
            const { error } = await supabaseClient
                .from("user_follows")
                .insert({
                    follower_id: user.id,
                    following_id: reel.user_id
                });

            if (error) throw error;
        }

        // Reload the saved status after following or unfollowing
        await loadReelFollowStatus();

    } catch (error) {
        console.error("Reels follow error:", error);
        alert("Could not update Follow. Please try again.");
    } finally {
        followButton.disabled = false;
    }
});

creatorHeader.append(creatorAvatar, creatorName, followButton);

// Start loading the saved follow status
loadReelFollowStatus();



            const video = document.createElement("video");
            video.src = reel.video_url;
            video.controls = true;
            video.playsInline = true;
            video.preload = "metadata";
            video.style.width = "100%";
            video.style.maxWidth = "450px";
            video.style.maxHeight = "60vh";
            video.style.borderRadius = "14px";
            video.style.background = "#000";

            const caption = document.createElement("p");
            caption.className = "reel-caption";
            caption.textContent = reel.caption || "";

            const actions = document.createElement("div");
            actions.className = "reel-actions";

            const likeButton = document.createElement("button");
            likeButton.type = "button";
            likeButton.className = "reel-like-button";
            likeButton.textContent =
                `${liked ? "❤️" : "🤍"} Like (${likes.length})`;
            likeButton.disabled = !user;

            const commentCount = document.createElement("span");
            commentCount.className = "reel-comment-count";
            commentCount.textContent = `💬 Comments (${comments.length})`;

            actions.append(likeButton, commentCount);

            const commentList = document.createElement("div");
            commentList.className = "reel-comment-list";

            function renderComments() {
                commentList.innerHTML = "";

                comments.forEach(function (comment) {
                    const item = document.createElement("p");
                    item.className = "reel-comment";
                    item.textContent = comment.content;
                    commentList.appendChild(item);
                });

                commentCount.textContent =
                    `💬 Comments (${comments.length})`;
            }

            renderComments();

            likeButton.addEventListener("click", async function () {
                if (!user) {
                    alert("Please sign in to like a Reel.");
                    return;
                }

                likeButton.disabled = true;

                try {
                    if (likedState()) {
                        const { error } = await supabaseClient
                            .from("reel_likes")
                            .delete()
                            .eq("reel_id", reel.id)
                            .eq("user_id", user.id);

                        if (error) throw error;

                        const index = allLikes.findIndex(item =>
                            item.reel_id === reel.id &&
                            item.user_id === user.id
                        );

                        if (index !== -1) allLikes.splice(index, 1);
                    } else {
                        const { data, error } = await supabaseClient
                            .from("reel_likes")
                            .insert({
                                reel_id: reel.id,
                                user_id: user.id
                            })
                            .select("reel_id, user_id")
                            .single();

                        if (error) throw error;
                        allLikes.push(data);
                    }

                    const nowLiked = allLikes.some(item =>
                        item.reel_id === reel.id &&
                        item.user_id === user.id
                    );

                    likeButton.textContent =
                        `${nowLiked ? "❤️" : "🤍"} Like (` +
                        allLikes.filter(item =>
                            item.reel_id === reel.id
                        ).length + ")";

                } catch (error) {
                    console.error("Reel like error:", error);
                    alert("Couldn't update your like. Please try again.");
                } finally {
                    likeButton.disabled = false;
                }
            });

            function likedState() {
                return allLikes.some(item =>
                    item.reel_id === reel.id &&
                    item.user_id === user.id
                );
            }

            const commentForm = document.createElement("form");
            commentForm.className = "reel-comment-form";

            const commentInput = document.createElement("input");
            commentInput.type = "text";
            commentInput.maxLength = 1000;
            commentInput.placeholder = user
                ? "Write a comment..."
                : "Sign in to comment";
            commentInput.required = true;
            commentInput.disabled = !user;
            commentInput.setAttribute("aria-label", "Reel comment");

            const sendButton = document.createElement("button");
            sendButton.type = "submit";
            sendButton.textContent = "Send";
            sendButton.disabled = !user;

            commentForm.append(commentInput, sendButton);

            commentForm.addEventListener("submit", async function (event) {
                event.preventDefault();

                const content = commentInput.value.trim();
                if (!user || !content) return;

                sendButton.disabled = true;

                try {
                    const { data, error } = await supabaseClient
                        .from("reel_comments")
                        .insert({
                            reel_id: reel.id,
                            user_id: user.id,
                            content: content
                        })
                        .select("id, reel_id, user_id, content, created_at")
                        .single();

                    if (error) throw error;

                    comments.push(data);
                    renderComments();
                    commentInput.value = "";

                } catch (error) {
                    console.error("Reel comment error:", error);
                    alert("Couldn't post your comment. Please try again.");
                } finally {
                    sendButton.disabled = false;
                }
            });

            const date = document.createElement("small");
            date.textContent = new Date(
                reel.created_at
            ).toLocaleString();


card.append(
    creatorHeader,
    video,
    caption,
    actions,
    commentList,
    commentForm,
    date
);


            feed.appendChild(card);
        });

        console.log("✅ Reels with likes and comments loaded:", reels.length);

        if (typeof window.setupReelsAutoPlay === "function") {
            window.setupReelsAutoPlay();
        }

    } catch (error) {
        console.error("Could not load Reels interactions:", error);

        feed.innerHTML = "";
        const message = document.createElement("p");
        message.textContent =
            "Couldn't load Reels interactions. Please check your connection and try again.";

        const retry = document.createElement("button");
        retry.type = "button";
        retry.textContent = "🔄 Try Again";
        retry.onclick = window.loadReelsFeed;

        feed.append(message, retry);
    }
};


/* ===== FREE CHAT Reels Auto-Play ===== */

window.setupReelsAutoPlay = function () {
    const feed = document.getElementById("reelsFeed");

    if (!feed) {
        console.warn("Reels feed not found.");
        return;
    }

    if (window.reelsAutoPlayObserver) {
        window.reelsAutoPlayObserver.disconnect();
    }

    const videos = feed.querySelectorAll("video");

    // Pause all videos before setting up playback.
    videos.forEach(function (video) {
        video.muted = true;
        video.playsInline = true;
        video.loop = true;
        video.pause();
    });

    window.reelsAutoPlayObserver = new IntersectionObserver(
        function (entries) {
            entries.forEach(function (entry) {
                const video = entry.target;

                if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
                    // Pause other Reels first.
                    videos.forEach(function (otherVideo) {
                        if (otherVideo !== video) {
                            otherVideo.pause();
                        }
                    });

                    video.play().catch(function (error) {
                        console.log(
                            "Playback needs user interaction:",
                            error
                        );
                    });
                } else {
                    video.pause();
                }
            });
        },
        {
            root: feed,
            threshold: [0, 0.6, 1]
        }
    );

    videos.forEach(function (video) {
        window.reelsAutoPlayObserver.observe(video);
    });

    console.log("✅ Reels auto-play is ready.");
};

/* =========================================
   FREE CHAT — FOLLOW SYSTEM
========================================= */

async function loadUserProfileFollow(userId) {
    const button = document.getElementById(
        "userProfileFollowButton"
    );

    const followersEl = document.getElementById(
        "userProfileFollowersCount"
    );

    const followingEl = document.getElementById(
        "userProfileFollowingCount"
    );

    if (!button || !followersEl || !followingEl) {
        console.warn("Follow profile HTML elements are missing.");
        return;
    }

    try {
        const { data: { user }, error: authError } =
            await supabaseClient.auth.getUser();

        if (authError) throw authError;

        if (!user) {
            button.hidden = true;
            return;
        }

        if (user.id === userId) {
            button.hidden = true;
        } else {
            button.hidden = false;
            button.disabled = true;
            button.textContent = "Loading...";

            button.onclick = () => toggleUserFollow(userId);
        }

        const [
            followersResult,
            followingResult,
            followStatusResult
] = await Promise.all([
    supabaseClient
        .from("user_follows")
        .select("follower_id", { count: "exact", head: true })
        .eq("following_id", userId),

    supabaseClient
        .from("user_follows")
        .select("following_id", { count: "exact", head: true })
        .eq("follower_id", userId),

    user.id === userId
        ? Promise.resolve({ data: null, error: null })
        : supabaseClient
            .from("user_follows")
            .select("follower_id")
            .eq("follower_id", user.id)
            .eq("following_id", userId)
            .maybeSingle()
]);


        if (followersResult.error) throw followersResult.error;
        if (followingResult.error) throw followingResult.error;
        if (followStatusResult.error) throw followStatusResult.error;

        followersEl.textContent = followersResult.count ?? 0;
        followingEl.textContent = followingResult.count ?? 0;

        if (user.id !== userId) {
            button.dataset.following =
                followStatusResult.data ? "true" : "false";

            button.textContent = followStatusResult.data
                ? " Following"
               : "➕ Follow";

            button.disabled = false;
        }

    } catch (error) {
        console.error("Follow profile error:", error);
        button.disabled = false;
        button.textContent = "➕ Follow";
        console.warn("Could not load follow information.");
    }
}

async function toggleUserFollow(userId) {
    const button = document.getElementById(
        "userProfileFollowButton"
    );

    if (!button || button.disabled) return;

    button.disabled = true;

    try {
        const { data: { user }, error: authError } =
            await supabaseClient.auth.getUser();

        if (authError) throw authError;
        if (!user) throw new Error("Please log in first.");
        if (user.id === userId) {
            throw new Error("You cannot follow your own profile.");
        }

        const isFollowing = button.dataset.following === "true";

        if (isFollowing) {
            const { error } = await supabaseClient
                .from("user_follows")
                .delete()
                .eq("follower_id", user.id)
                .eq("following_id", userId);

            if (error) throw error;
        } else {
            const { error } = await supabaseClient
                .from("user_follows")
                .insert({
                    follower_id: user.id,
                    following_id: userId
                });

            if (error) throw error;
        }

        await loadUserProfileFollow(userId);
    } catch (error) {
        console.error("Follow action error:", error);
        alert("Could not update Follow status. " + error.message);
        button.disabled = false;
    }
}

/* =========================================================
   LOAD CREATOR REELS ON PROFILE
========================================================= */

async function loadUserProfileReels(userId) {
    const container = document.getElementById("userProfileReels");
console.log("Reels container:", container);
console.log("Reels container visible:", container?.getBoundingClientRect());
console.log("Reels container parent:", container?.parentElement);
    if (!container) return;

    container.innerHTML = `
        <p class="user-profile-loading">Loading Reels...</p>
    `;

    try {
        const { data: reels, error } = await supabaseClient
            .from("reels")
            .select("id, user_id, video_url, caption, created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false });

        if (error) throw error;
        
console.log("Creator profile ID:", userId);
console.log("Creator profile Reels:", reels);

        if (!reels || reels.length === 0) {
            container.innerHTML = `
                <div class="user-profile-empty">
                    🎬 This creator hasn't posted any Reels yet.
                </div>
            `;
            return;
        }

        container.innerHTML = "";

        reels.forEach(function (reel) {
            const item = document.createElement("div");
            item.className = "user-profile-reel-item";

            const video = document.createElement("video");
            video.src = reel.video_url;
            video.preload = "metadata";
            video.muted = true;
            video.playsInline = true;

            const playIcon = document.createElement("span");
            playIcon.className = "user-profile-reel-play";
            playIcon.textContent = "▶";

            item.append(video, playIcon);

            if (reel.caption) {
                item.title = reel.caption;
            }

            item.addEventListener("click", function () {
                video.controls = true;
                video.muted = false;

                const result = video.play();
                if (result) {
                    result.catch(function (error) {
                        console.warn("Reel playback needs user interaction.", error);
                    });
                }
            });

            container.appendChild(item);
        });

        console.log("✅ Creator Reels loaded:", reels.length);

    } catch (error) {
        console.error("Creator Reels error:", error);

        container.innerHTML = `
            <div class="user-profile-empty">
                ❌ Could not load Reels. Please try again.
            </div>
        `;
    }
}

/* =========================================
   FREE CHAT PROFILE POSTS / REELS TABS
========================================= */

function setupUserProfileTabs() {
    const postsTab = document.getElementById("userProfilePostsTab");
    const reelsTab = document.getElementById("userProfileReelsTab");
    const postsSection = document.querySelector(
        ".user-profile-posts-section"
    );
    const reelsSection = document.querySelector(
        ".user-profile-reels-section"
    );

    if (!postsTab || !reelsTab || !postsSection || !reelsSection) {
        console.warn("Profile tabs: a required HTML element is missing.");
        return;
    }

    function showTab(tabName) {
        const showPosts = tabName === "posts";

        postsSection.hidden = !showPosts;
        reelsSection.hidden = showPosts;

        postsTab.classList.toggle("active", showPosts);
        reelsTab.classList.toggle("active", !showPosts);

        postsTab.setAttribute("aria-selected", String(showPosts));
        reelsTab.setAttribute("aria-selected", String(!showPosts));

        if (!showPosts && currentViewedUserId) {
    loadUserProfileReels(currentViewedUserId).catch(function (error) {
        console.error("Failed to load profile Reels:", error);
    });
}
            
        
    }

    postsTab.onclick = function () {
        showTab("posts");
    };

    reelsTab.onclick = function () {
        showTab("reels");
    };

    // Start with Posts selected each time the profile opens.
    showTab("posts");
}

window.setupUserProfileTabs = setupUserProfileTabs;
async function showProfileConnections(userId, type) {
    const panel = fcEnsureFeaturePanel();
    const title = document.getElementById("fcFeatureTitle");
    const subtitle = document.getElementById("fcFeatureSubtitle");
    const content = document.getElementById("fcFeatureContent");

    const isFollowers = type === "followers";

    title.textContent = isFollowers ? "👥 Followers" : "➡️ Following";
    subtitle.textContent = "Loading people...";
    content.innerHTML = '<p class="fc-feature-empty">Loading...</p>';

    panel.dataset.feature = "profile-connections";
    panel.classList.remove("hidden");

    try {
        const column = isFollowers ? "follower_id" : "following_id";

        const { data: connections, error } = await supabaseClient
            .from("user_follows")
            .select("follower_id, following_id")
            .eq(isFollowers ? "following_id" : "follower_id", userId);

        if (error) throw error;

        const connectionIds = (connections || []).map(row =>
            isFollowers ? row.follower_id : row.following_id
        );

        subtitle.textContent = `${connectionIds.length} ${isFollowers ? "followers" : "following"}`;

        if (!connectionIds.length) {
            content.innerHTML = '<p class="fc-feature-empty">No people to show yet.</p>';
            return;
        }

        const { data: profiles, error: profileError } = await supabaseClient
            .from("profiles")
            .select("*")
            .in("id", connectionIds);

        if (profileError) throw profileError;

        content.innerHTML = "";

        (profiles || []).forEach(profile => {
            const row = document.createElement("button");
            row.type = "button";
            row.className = "fc-feature-row";

            const name =
                profile.username ||
                profile.full_name ||
                profile.name ||
                "FREE CHAT user";

            row.textContent = name;

            row.addEventListener("click", () => {
                closeFeaturePanel();

                // Open the profile using your app's existing profile function.
                if (typeof window.openUserProfile === "function") {
                    window.openUserProfile(profile.id);
                } else {
                    console.warn(
                        "Connect openUserProfile() to your existing profile-opening function."
                    );
                }
            });

            content.appendChild(row);
        });

    } catch (error) {
        console.error("Profile connections error:", error);
        subtitle.textContent = "Could not load connections";
        content.innerHTML =
            '<p class="fc-feature-empty">Could not load this list. Please try again.</p>';
    }
}
/* =========================================
   LOAD SAVED APPEARANCE
========================================= */

function loadSavedAppearance() {
    const savedTheme =
        localStorage.getItem("fcAppearance") || "light";

    document.documentElement.dataset.theme =
        savedTheme === "dark" ? "dark" : "light";
}

loadSavedAppearance();
const fcTranslations = {
en: {
menu_title: "Menu",
menu_subtitle: "Everything in one place",
view_profile: "View your profile",
invite_friends: "Invite friends",
shortcuts: "SHORTCUTS",
messages: "Messages",
groups: "Groups",
friends: "Friends",
settings_subtitle: "Manage your FREE CHAT experience",
reels: "Reels",
marketplace: "Marketplace",
saved: "Saved",
memories: "Memories",
birthdays: "Birthdays",
events: "Events",
verification: "Verification",
mobile_center: "Mobile Center",
feeds: "Feeds",
photos: "Photos",
settings_privacy: "Settings & privacy",
manage_account: "Manage your account",
help_support: "Help & support",
get_help: "Get help with FREE CHAT",
add_account: "Add account",
add_another_account: "Add another account",
logout: "Log out",
tagline: "Connect. Chat. Stay close."
},
fr: {
menu_title: "Menu",
menu_subtitle: "Tout au même endroit",
view_profile: "Voir votre profil",
invite_friends: "Inviter des amis",
shortcuts: "RACCOURCIS",
messages: "Messages",
groups: "Groupes",
friends: "Amis",
reels: "Reels",
marketplace: "Marketplace",
saved: "Enregistrés",
memories: "Souvenirs",
birthdays: "Anniversaires",
events: "Événements",
verification: "Vérification",
mobile_center: "Centre mobile",
feeds: "Actualités",
photos: "Photos",
settings_privacy: "Paramètres et confidentialité",
manage_account: "Gérer votre compte",
settings_subtitle: "Gérez votre expérience FREE CHAT",
help_support: "Aide et assistance",
get_help: "Obtenir de l'aide sur FREE CHAT",
add_account: "Ajouter un compte",
add_another_account: "Ajouter un autre compte",
logout: "Se déconnecter",
tagline: "Connectez-vous. Discutez. Restez proches."
},
es: {
menu_title: "Menú",
menu_subtitle: "Todo en un solo lugar",
view_profile: "Ver tu perfil",
invite_friends: "Invitar amigos",
shortcuts: "ACCESOS DIRECTOS",
messages: "Mensajes",
groups: "Grupos",
friends: "Amigos",
reels: "Reels",
marketplace: "Mercado",
saved: "Guardados",
memories: "Recuerdos",
birthdays: "Cumpleaños",
events: "Eventos",
verification: "Verificación",
mobile_center: "Centro móvil",
feeds: "Noticias",
photos: "Fotos",
settings_privacy: "Configuración y privacidad",
manage_account: "Administra tu cuenta",
help_support: "Ayuda y soporte",
get_help: "Obtén ayuda con FREE CHAT",
add_account: "Añadir cuenta",
add_another_account: "Añadir otra cuenta",
logout: "Cerrar sesión",
tagline: "Conecta. Chatea. Mantente cerca."
},
yo: {
menu_title: "Àkójọ",
menu_subtitle: "Gbogbo nkan ní ibi kan",
view_profile: "Wo profaili rẹ",
invite_friends: "Pe àwọn ọ̀rẹ́",
shortcuts: "ÀWỌN Ọ̀NÀ KÍÁ",
messages: "Ìfiránṣẹ́",
groups: "Àwọn ẹgbẹ́",
friends: "Àwọn ọ̀rẹ́",
reels: "Reels",
marketplace: "Ọjà",
saved: "Àwọn tí a fipamọ́",
memories: "Àwọn ìrántí",
birthdays: "Ọjọ́ ìbí",
events: "Àwọn ìṣẹ̀lẹ̀",
verification: "Ìjẹ́rìí",
mobile_center: "Ibi iṣẹ́ fóònù",
feeds: "Àwọn ìròyìn",
photos: "Àwọn fọ́tò",
settings_privacy: "Ètò àti àṣírí",
manage_account: "Ṣàkóso àkọọ́lẹ̀ rẹ",
help_support: "Ìrànlọ́wọ́",
get_help: "Gba ìrànlọ́wọ́ fún FREE CHAT",
add_account: "Fi àkọọ́lẹ̀ kún",
add_another_account: "Fi àkọọ́lẹ̀ míì kún",
logout: "Jáde",
tagline: "Sopọ̀. Báni sọ̀rọ̀. Máa sún mọ́ra."
}
};

function applyAppLanguage(language) {
    const translations = fcTranslations[language] || fcTranslations.en;

    document.querySelectorAll("[data-i18n]").forEach(element => {
        const key = element.dataset.i18n;

        if (translations[key]) {
            element.textContent = translations[key];
        }
    });
}



function loadAppLanguage() {
const language = localStorage.getItem("fcLanguage") || "en";
applyAppLanguage(language);
}

if (document.readyState === "loading") {
document.addEventListener("DOMContentLoaded", loadAppLanguage);
} else {
loadAppLanguage();
}
/* ==========================================
FREE CHAT — CHANGE PASSWORD
========================================== */

async function openChangePassword() {
showFeaturePanel("change-password");

document.getElementById("fcFeatureTitle").textContent =
    "🔑 Change Password";

document.getElementById("fcFeatureSubtitle").textContent =
    "Choose a new password for your account";

const content = document.getElementById("fcFeatureContent");

content.innerHTML = `
    <form id="fcChangePasswordForm">
        <label class="fc-feature-label" for="fcNewPassword">
            New password
        </label>

        <input
            type="password"
            id="fcNewPassword"
            class="fc-feature-input"
            minlength="8"
            autocomplete="new-password"
            placeholder="Enter a new password"
            required
        >

        <label class="fc-feature-label" for="fcConfirmPassword">
            Confirm new password
        </label>

        <input
            type="password"
            id="fcConfirmPassword"
            class="fc-feature-input"
            minlength="8"
            autocomplete="new-password"
            placeholder="Enter the password again"
            required
        >

        <p id="fcPasswordMessage" role="status"></p>

        <button
            type="submit"
            class="fc-settings-save"
            id="fcPasswordSubmit"
        >
            Update Password
        </button>
    </form>
`;

document.getElementById("fcChangePasswordForm")
    .addEventListener("submit", async (event) => {
        event.preventDefault();

        const password =
            document.getElementById("fcNewPassword").value;

        const confirmPassword =
            document.getElementById("fcConfirmPassword").value;

        const message =
            document.getElementById("fcPasswordMessage");

        const submitButton =
            document.getElementById("fcPasswordSubmit");

        if (password.length < 8) {
            message.textContent =
                "Your password must contain at least 8 characters.";
            return;
        }

        if (password !== confirmPassword) {
            message.textContent =
                "The passwords do not match.";
            return;
        }

        if (
            typeof supabaseClient === "undefined" ||
            !supabaseClient.auth ||
            typeof supabaseClient.auth.updateUser !== "function"
        ) {
            message.textContent =
                "Authentication is not available. Please try again.";
            return;
        }

        submitButton.disabled = true;
        submitButton.textContent = "Updating...";

        try {
            const { error } =
                await supabaseClient.auth.updateUser({
                    password: password
                });

            if (error) {
                throw error;
            }

            message.textContent =
                "✅ Your password has been updated successfully.";

            document.getElementById("fcChangePasswordForm").reset();

        } catch (error) {
            console.error("Password update failed:", error);

            message.textContent =
                error.message ||
                "Could not update your password. Please try again.";

        } finally {
            submitButton.disabled = false;
            submitButton.textContent = "Update Password";
        }
    });

}
/* ==========================================
   ❓ FREE CHAT — HELP & SUPPORT
========================================== */

async function openHelpSupport() {
    showFeaturePanel("help-support");

    document.getElementById("fcFeatureTitle").textContent =
        "❓ Help & Support";

    document.getElementById("fcFeatureSubtitle").textContent =
        "How can we help you?";

    const content = document.getElementById("fcFeatureContent");

    content.innerHTML = `
        <div class="fc-feature-row">
            <strong>📖 Help Center</strong>
            <p>Find answers to common questions about FREE CHAT.</p>
            <button type="button" class="fc-settings-save"
                id="fcHelpCenterBtn">View Help</button>
        </div>

        <div class="fc-feature-row">
            <strong>🔐 Account Help</strong>
            <p>Get help with logging in, passwords, and your account.</p>
            <button type="button" class="fc-settings-save"
                id="fcAccountHelpBtn">Account Help</button>
        </div>

        <div class="fc-feature-row">
            <strong>🐛 Report a Problem</strong>
            <p>Tell us if something is not working correctly.</p>
            <button type="button" class="fc-settings-save"
                id="fcReportProblemBtn">Report a Problem</button>
        </div>

        <div class="fc-feature-row">
            <strong>📩 Contact Support</strong>
            <p>Send a message describing the help you need.</p>
            <button type="button" class="fc-settings-save"
                id="fcContactSupportBtn">Contact Support</button>
        </div>
        <div class="fc-feature-row">
    <strong>💬 My Support Requests</strong>
    <p>Check your support request status and read replies from our team.</p>
    <button type="button" class="fc-settings-save"
        id="fcMySupportRequestsBtn">View My Requests</button>
</div>

        <div id="fcAdminSupportArea"></div>
        <p id="fcHelpStatus" role="status"></p>
    `;

    const status = document.getElementById("fcHelpStatus");

    document.getElementById("fcHelpCenterBtn")
        .addEventListener("click", () => {
            status.textContent =
                "Welcome to FREE CHAT! You can chat with friends, manage your profile, change privacy settings, and customize your account.";
        });

    document.getElementById("fcAccountHelpBtn")
        .addEventListener("click", () => {
            status.textContent =
                "For account help, open Settings & Privacy. You can change your password and manage your privacy settings there.";
        });

    document.getElementById("fcReportProblemBtn")
        .addEventListener("click", openReportProblemForm);

    document.getElementById("fcContactSupportBtn")
        .addEventListener("click", openContactSupportForm);
document.getElementById("fcMySupportRequestsBtn")
    .addEventListener("click", openMySupportRequests);


    // Show the admin inbox entry only to accounts with the admin role.
    try {
        const { data, error } = await supabaseClient.auth.getUser();

        if (error) throw error;

        if (data?.user?.app_metadata?.role === "admin") {
            const adminArea =
                document.getElementById("fcAdminSupportArea");

            if (adminArea) {
                adminArea.innerHTML = `
                    <div class="fc-feature-row">
                        <strong>🛡️ Admin Support Inbox</strong>
                        <p>Review and manage support requests from users.</p>
                        <button type="button" class="fc-settings-save"
                            id="fcAdminSupportInboxBtn">
                            Open Admin Inbox
                        </button>
                    </div>
                `;

                document.getElementById("fcAdminSupportInboxBtn")
                    .addEventListener("click", () => {
                        window.location.href = "admin-support.html";
                    });

                // User management is shown only to authenticated admins.
                const manageUsersRow = document.createElement("div");
                manageUsersRow.className = "fc-feature-row";
                manageUsersRow.innerHTML = `
                    <strong>👥 Manage Users</strong>
                    <p>Search accounts, ban, unban, or delete users.</p>
                    <button type="button" class="fc-settings-save"
                        id="fcManageUsersBtn">Manage Users</button>
                `;
                adminArea.appendChild(manageUsersRow);

                document.getElementById("fcManageUsersBtn")
                    .addEventListener("click", () => {
                        window.location.href = "admin-users.html";
                    });
            }
        }
    } catch (error) {
        console.error("Could not check admin role:", error);
    }
}
/* ==========================================
   📩 FREE CHAT — CONTACT SUPPORT FORM
========================================== */

function openContactSupportForm() {
    const content = document.getElementById("fcFeatureContent");

    if (!content) {
        alert("Support screen could not be opened. Please try again.");
        return;
    }

    content.innerHTML = `
        <div class="fc-feature-row">
            <strong>📩 Contact FREE CHAT Support</strong>
            <p>Describe your problem or ask us a question.</p>
        </div>

        <form id="fcContactSupportForm">
            <label for="fcSupportSubject">Subject</label>
            <input
                id="fcSupportSubject"
                class="fc-feature-input"
                type="text"
                maxlength="120"
                placeholder="What do you need help with?"
                required
            >

            <label for="fcSupportMessage">Your message</label>
            <textarea
                id="fcSupportMessage"
                class="fc-feature-input"
                rows="5"
                maxlength="5000"
                placeholder="Describe how we can help..."
                required
            ></textarea>

            <p id="fcSupportFormStatus" role="status"></p>

            <button
                id="fcSupportSubmitBtn"
                class="fc-settings-save"
                type="submit"
            >
                Send Support Request
            </button>

            <button
                id="fcSupportBackBtn"
                class="fc-settings-save"
                type="button"
            >
                Back
            </button>
        </form>
    `;

    document.getElementById("fcSupportBackBtn")
        .addEventListener("click", openHelpSupport);

    document.getElementById("fcContactSupportForm")
        .addEventListener("submit", async function(event) {
            event.preventDefault();

            const subject = document
                .getElementById("fcSupportSubject")
                .value.trim();

            const message = document
                .getElementById("fcSupportMessage")
                .value.trim();

            const status = document
                .getElementById("fcSupportFormStatus");

            const submitButton = document
                .getElementById("fcSupportSubmitBtn");

            if (!subject || !message) {
                status.textContent = "Please complete both fields.";
                return;
            }

            if (subject.length > 120 || message.length > 5000) {
                status.textContent = "Your message is too long.";
                return;
            }

            submitButton.disabled = true;
            submitButton.textContent = "Sending...";
            status.textContent = "";

            try {
                const {
                    data: { user },
                    error: userError
                } = await supabaseClient.auth.getUser();

                if (userError) throw userError;

                if (!user) {
                    status.textContent =
                        "Please log in before contacting support.";
                    return;
                }

                const { error } = await supabaseClient
                    .from("support_requests")
                    .insert({
                        user_id: user.id,
                        subject: subject,
                        message: message
                    });

                if (error) throw error;

                document.getElementById("fcContactSupportForm").reset();

                status.textContent =
                    "✅ Your support request was submitted successfully.";

            } catch (error) {
                console.error("Support request failed:", error);

                status.textContent =
                    "We couldn't send your request. Please try again.";
            } finally {
                submitButton.disabled = false;
                submitButton.textContent = "Send Support Request";
            }
        });
}
/* ==========================================
   🐛 FREE CHAT — REPORT A PROBLEM
========================================== */

function openReportProblemForm() {
    const content = document.getElementById("fcFeatureContent");

    if (!content) {
        alert("The reporting form could not be opened.");
        return;
    }

    content.innerHTML = `
        <div class="fc-feature-row">
            <strong>🐛 Report a Problem</strong>
            <p>Tell us what went wrong so we can improve FREE CHAT.</p>
        </div>

        <form id="fcReportProblemForm">
            <label for="fcProblemType">Problem type</label>

            <select
                id="fcProblemType"
                class="fc-feature-input"
                required
            >
                <option value="">Choose a problem</option>
                <option value="login">Login or account issue</option>
                <option value="messaging">Messaging problem</option>
                <option value="profile">Profile problem</option>
                <option value="upload">Photo or video upload</option>
                <option value="settings">Settings problem</option>
                <option value="other">Other</option>
            </select>

            <label for="fcProblemDescription">Describe the problem</label>

            <textarea
                id="fcProblemDescription"
                class="fc-feature-input"
                rows="5"
                maxlength="5000"
                placeholder="What happened? What were you trying to do?"
                required
            ></textarea>

            <p id="fcProblemStatus" role="status"></p>

            <button
                type="submit"
                id="fcProblemSubmit"
                class="fc-settings-save"
            >
                Submit Report
            </button>

            <button
                type="button"
                id="fcProblemBack"
                class="fc-settings-save"
            >
                Back
            </button>
        </form>
    `;

    document.getElementById("fcProblemBack")
        .addEventListener("click", openHelpSupport);

    document.getElementById("fcReportProblemForm")
        .addEventListener("submit", async function(event) {
            event.preventDefault();

            const type =
                document.getElementById("fcProblemType").value;

            const description =
                document.getElementById("fcProblemDescription")
                    .value.trim();

            const status =
                document.getElementById("fcProblemStatus");

            const submitButton =
                document.getElementById("fcProblemSubmit");

            if (!type || !description) {
                status.textContent =
                    "Please choose a problem type and describe the issue.";
                return;
            }

            submitButton.disabled = true;
            submitButton.textContent = "Submitting...";
            status.textContent = "";

            try {
                const {
                    data: { user },
                    error: userError
                } = await supabaseClient.auth.getUser();

                if (userError) throw userError;

                if (!user) {
                    status.textContent =
                        "Please log in before submitting a report.";
                    return;
                }

                const { error } = await supabaseClient
                    .from("support_requests")
                    .insert({
                        user_id: user.id,
                        subject: "Bug report: " + type,
                        message: description
                    });

                if (error) throw error;

                document.getElementById("fcReportProblemForm").reset();

                status.textContent =
                    "✅ Your report was submitted successfully. Thank you!";

            } catch (error) {
                console.error("Problem report failed:", error);

                status.textContent =
                    "Could not submit your report. Please try again.";
            } finally {
                submitButton.disabled = false;
                submitButton.textContent = "Submit Report";
            }
        });
}
async function loadAdminSupportRequests() {
const list = document.getElementById("fcAdminSupportRequests");
const status = document.getElementById("fcAdminInboxStatus");

if (!list || !status) return;

list.innerHTML = "";
status.textContent = "Loading support requests...";

try {
    // Confirm the current administrator
    const { data: authData, error: authError } =
        await supabaseClient.auth.getUser();

    if (authError) throw authError;

    const admin = authData?.user;

    if (!admin || admin.app_metadata?.role !== "admin") {
        status.textContent = "Access denied: administrators only.";
        return;
    }

    // Load support requests
    const { data: requests, error } = await supabaseClient
        .from("support_requests")
        .select("id, subject, message, status, created_at, user_id")
        .order("created_at", { ascending: false });

    if (error) throw error;

    if (!requests || requests.length === 0) {
        status.textContent =
            "No support requests have been submitted yet.";
        return;
    }

    // Load usernames
    const userIds = [
        ...new Set(requests.map(request => request.user_id))
    ];

    const profileMap = {};

    if (userIds.length > 0) {
        const { data: profiles, error: profileError } =
            await supabaseClient
                .from("profiles")
                .select("id, username, full_name, name")
                .in("id", userIds);

        if (profileError) {
            console.warn("Could not load usernames:", profileError);
        } else {
            (profiles || []).forEach(profile => {
                profileMap[profile.id] =
                    profile.username ||
                    profile.full_name ||
                    profile.name ||
                    "FREE CHAT user";
            });
        }
    }

    status.textContent =
        `${requests.length} support request(s) found.`;

    // Display each support request
    for (const request of requests) {
        const card = document.createElement("div");
        card.className = "fc-feature-row";

        const title = document.createElement("strong");
        title.textContent = request.subject;

        const user = document.createElement("p");
        user.textContent =
            `👤 ${profileMap[request.user_id] || "FREE CHAT user"}`;

        const messageLabel = document.createElement("strong");
        messageLabel.textContent = "User's message";

        const message = document.createElement("p");
        message.textContent = request.message;

        const details = document.createElement("p");

        const updateDetails = () => {
            details.textContent =
                `Status: ${request.status.replace("_", " ")} • Received: ` +
                new Date(request.created_at).toLocaleString();
        };

        updateDetails();

        // Status selector
        const select = document.createElement("select");
        select.className = "fc-feature-input";
        select.setAttribute("aria-label", "Request status");

        [
            ["open", "Open"],
            ["in_progress", "In progress"],
            ["resolved", "Resolved"]
        ].forEach(([value, label]) => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = label;
            select.appendChild(option);
        });

        select.value = request.status;

        const save = document.createElement("button");
        save.type = "button";
        save.className = "fc-settings-save";
        save.textContent = "Save Status";

        save.addEventListener("click", async () => {
            save.disabled = true;
            save.textContent = "Saving...";

            try {
                const { data: currentAuth, error: currentAuthError } =
                    await supabaseClient.auth.getUser();

                if (currentAuthError) throw currentAuthError;

                if (
                    currentAuth?.user?.app_metadata?.role !== "admin"
                ) {
                    throw new Error("Administrator access is required.");
                }

                const { error: updateError } = await supabaseClient
                    .from("support_requests")
                    .update({ status: select.value })
                    .eq("id", request.id);

                if (updateError) throw updateError;

                request.status = select.value;
                updateDetails();
                status.textContent = "✅ Request status updated.";
            } catch (error) {
                console.error("Could not update status:", error);
                status.textContent =
                    "Could not update status. Please try again.";
            } finally {
                save.disabled = false;
                save.textContent = "Save Status";
            }
        });

        // Replies conversation area
        const repliesHeading = document.createElement("strong");
        repliesHeading.textContent = "💬 Conversation";

        const repliesList = document.createElement("div");
        repliesList.className = "fc-support-replies";
        repliesList.textContent = "Loading replies...";

        // Load replies belonging to this request
        try {
            const { data: replies, error: repliesError } =
                await supabaseClient
                    .from("support_replies")
                    .select("id, request_id, sender_id, message, created_at")
                    .eq("request_id", request.id)
                    .order("created_at", { ascending: true });

            if (repliesError) throw repliesError;

            repliesList.innerHTML = "";

            if (!replies || replies.length === 0) {
                const empty = document.createElement("p");
                empty.textContent = "No replies yet.";
                repliesList.appendChild(empty);
            } else {
                replies.forEach(reply => {
                    const replyCard = document.createElement("div");
                    replyCard.className = "fc-feature-row";

                    const sender = document.createElement("strong");
                    sender.textContent =
                        reply.sender_id === admin.id
                            ? "🛡️ Support team"
                            : "👤 User";

                    const replyMessage = document.createElement("p");
                    replyMessage.textContent = reply.message;

                    const replyDate = document.createElement("small");
                    replyDate.textContent =
                        new Date(reply.created_at).toLocaleString();

                    replyCard.append(sender, replyMessage, replyDate);
                    repliesList.appendChild(replyCard);
                });
            }
        } catch (replyError) {
            console.error("Could not load replies:", replyError);
            repliesList.textContent =
                "Replies could not be loaded. Check support_replies permissions.";
        }

        // Reply input
        const replyInput = document.createElement("textarea");
        replyInput.className = "fc-feature-input";
        replyInput.rows = 3;
        replyInput.maxLength = 5000;
        replyInput.placeholder = "Write your reply to this user...";
        replyInput.setAttribute("aria-label", "Write a support reply");

        const replyButton = document.createElement("button");
        replyButton.type = "button";
        replyButton.className = "fc-settings-save";
        replyButton.textContent = "📩 Send Reply";

        replyButton.addEventListener("click", async () => {
            const replyText = replyInput.value.trim();

            if (!replyText) {
                status.textContent = "Please write a reply first.";
                return;
            }

            replyButton.disabled = true;
            replyButton.textContent = "Sending...";

            try {
                const { data: currentAuth, error: currentAuthError } =
                    await supabaseClient.auth.getUser();

                if (currentAuthError) throw currentAuthError;

                const currentUser = currentAuth?.user;

                if (
                    !currentUser ||
                    currentUser.app_metadata?.role !== "admin"
                ) {
                    throw new Error("Administrator access is required.");
                }

                const { error: insertError } = await supabaseClient
                    .from("support_replies")
                    .insert({
                        request_id: request.id,
                        sender_id: currentUser.id,
                        message: replyText
                    });

                if (insertError) throw insertError;

                status.textContent = "✅ Reply sent successfully.";
                replyInput.value = "";

                // Refresh the inbox to display the new reply
                await loadAdminSupportRequests();
                return;
            } catch (replyError) {
                console.error("Could not send support reply:", replyError);
                status.textContent =
                    "Could not send reply. Check your connection and permissions.";
            } finally {
                replyButton.disabled = false;
                replyButton.textContent = "📩 Send Reply";
            }
        });

        card.append(
            title,
            user,
            messageLabel,
            message,
            details,
            select,
            save,
            repliesHeading,
            repliesList,
            replyInput,
            replyButton
        );

        list.appendChild(card);
    }
} catch (error) {
    console.error("Admin support inbox failed:", error);
    status.textContent =
        "Could not load requests. Check your connection and Supabase permissions.";
}

}
/* ==========================================
🛡️ FREE CHAT — ADMIN SUPPORT INBOX
========================================== */

async function openAdminSupportInbox() {
const content = document.getElementById("fcFeatureContent");
const title = document.getElementById("fcFeatureTitle");
const subtitle = document.getElementById("fcFeatureSubtitle");

if (!content || !title || !subtitle) {
    console.error("Admin inbox: required screen elements are missing.");
    return;
}

showFeaturePanel("admin-support-inbox");

title.textContent = "🛡️ Admin Support Inbox";
subtitle.textContent = "Review and manage user support requests.";

content.innerHTML = `
    <div class="fc-feature-row">
        <strong>📩 Support Requests</strong>
        <p>View and reply to support requests from FREE CHAT users.</p>
        <button id="fcRefreshSupportInbox"
            class="fc-settings-save" type="button">
            🔄 Refresh Inbox
        </button>
        <p id="fcAdminInboxStatus" role="status">
            Loading support requests...
        </p>
    </div>

    <div id="fcAdminSupportRequests"></div>

    <button id="fcAdminInboxBack"
        class="fc-settings-save" type="button">
        ← Back to Help & Support
    </button>
`;

document.getElementById("fcAdminInboxBack")
    .addEventListener("click", openHelpSupport);

document.getElementById("fcRefreshSupportInbox")
    .addEventListener("click", loadAdminSupportRequests);

await loadAdminSupportRequests();

}
/* ==========================================
💬 FREE CHAT — MY SUPPORT REQUESTS
========================================== */

async function openMySupportRequests() {
const content = document.getElementById("fcFeatureContent");

if (!content) return;

showFeaturePanel("my-support-requests");

document.getElementById("fcFeatureTitle").textContent =
    "💬 My Support Requests";

document.getElementById("fcFeatureSubtitle").textContent =
    "Check your requests and replies from FREE CHAT Support.";

content.innerHTML = `
  <div class="fc-feature-row my-support-header">
    <strong>📩 My Support Requests</strong>
    <p>View your messages, request status, and support replies.</p><button id="fcRefreshMyRequests"
    class="fc-settings-save my-support-refresh"
    type="button">
    🔄 Refresh Requests
</button>

<p id="fcMyRequestsStatus" role="status">Loading...</p>
</div>

<div id="fcMyRequestsList"></div>
    <button id="fcMyRequestsBack"
        class="fc-settings-save" type="button">
        ← Back to Help & Support
    </button>
`;

document.getElementById("fcMyRequestsBack")
    .addEventListener("click", openHelpSupport);

document.getElementById("fcRefreshMyRequests")
    .addEventListener("click", loadMySupportRequests);

await loadMySupportRequests();

}

async function loadMySupportRequests() {
const list = document.getElementById("fcMyRequestsList");
const status = document.getElementById("fcMyRequestsStatus");

if (!list || !status) return;

list.replaceChildren();
status.textContent = "Loading your requests...";

try {
    const {
        data: { user },
        error: userError
    } = await supabaseClient.auth.getUser();

    if (userError) throw userError;

    if (!user) {
        status.textContent = "Please log in to view your requests.";
        return;
    }

    const { data: requests, error } = await supabaseClient
        .from("support_requests")
        .select("id, subject, message, status, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

    if (error) throw error;

    if (!requests || requests.length === 0) {
        status.textContent = "You haven't submitted any support requests yet.";
        return;
    }

    status.textContent = `${requests.length} request(s) found.`;

    for (const request of requests) {
        const card = document.createElement("article");
        card.className = "fc-feature-row";

        const heading = document.createElement("h3");
        heading.textContent = request.subject;

        const requestStatus = document.createElement("p");
        requestStatus.textContent =
            `Status: ${request.status.replace("_", " ")}`;

        const message = document.createElement("p");
        message.textContent = request.message;

        const date = document.createElement("small");
        date.textContent =
            new Date(request.created_at).toLocaleString();

        const repliesTitle = document.createElement("strong");
        repliesTitle.textContent = "💬 Support replies";

        const repliesBox = document.createElement("div");
        repliesBox.textContent = "Loading replies...";
const userReplyInput = document.createElement("textarea");
userReplyInput.className = "fc-feature-input";
userReplyInput.placeholder = "Reply to FREE CHAT Support...";
userReplyInput.maxLength = 5000;
userReplyInput.rows = 3;

const sendUserReplyBtn = document.createElement("button");
sendUserReplyBtn.className = "fc-settings-save";
sendUserReplyBtn.type = "button";
sendUserReplyBtn.textContent = "📤 Send Reply";

sendUserReplyBtn.addEventListener("click", async () => {
const replyText = userReplyInput.value.trim();

if (!replyText) {
    userReplyInput.focus();
    return;
}

sendUserReplyBtn.disabled = true;
sendUserReplyBtn.textContent = "Sending...";

try {
    const {
        data: { user },
        error: userError
    } = await supabaseClient.auth.getUser();

    if (userError) throw userError;

    if (!user) {
        throw new Error("Please log in again.");
    }

    const { error } = await supabaseClient
        .from("support_replies")
        .insert({
            request_id: request.id,
            sender_id: user.id,
            message: replyText
        });

    if (error) throw error;

    userReplyInput.value = "";
    sendUserReplyBtn.textContent = "Reply sent ✓";

    // Reload the conversation to display the new reply.
    await loadMySupportRequests();

} catch (error) {
    console.error("User support reply failed:", error);
    sendUserReplyBtn.textContent = "Failed — retry";
    alert(error.message || "Could not send your reply.");
} finally {
    sendUserReplyBtn.disabled = false;

    if (sendUserReplyBtn.textContent === "Sending...") {
        sendUserReplyBtn.textContent = "📤 Send Reply";
    }
}

});

        card.append(
    heading,
    requestStatus,
    message,
    date,
    repliesTitle,
    repliesBox,
    userReplyInput,
    sendUserReplyBtn
);

        list.appendChild(card);

        const { data: replies, error: repliesError } =
            await supabaseClient
                .from("support_replies")
                .select("id, sender_id, message, created_at")
                .eq("request_id", request.id)
                .order("created_at", { ascending: true });

        if (repliesError) {
            repliesBox.textContent = "Replies could not be loaded.";
            console.error("Support replies error:", repliesError);
            continue;
        }

        repliesBox.replaceChildren();

        if (!replies || replies.length === 0) {
            repliesBox.textContent = "No replies yet.";
            continue;
        }

        replies.forEach(reply => {
            const replyCard = document.createElement("div");
            replyCard.className = "fc-feature-row";

            const sender = document.createElement("strong");
            sender.textContent = "🛡️ FREE CHAT Support";

            const replyMessage = document.createElement("p");
            replyMessage.textContent = reply.message;

            const replyDate = document.createElement("small");
            replyDate.textContent =
                new Date(reply.created_at).toLocaleString();

            replyCard.append(sender, replyMessage, replyDate);
            repliesBox.appendChild(replyCard);
        });
    }
} catch (error) {
    console.error("Could not load support requests:", error);
    status.textContent =
        "Could not load your requests. Please try again.";
}

}
/* ==========================================
🔔 FREE CHAT — SUPPORT REPLY NOTIFICATIONS
========================================== */

let supportReplyCheckTimer = null;
let lastSupportReplyCheck = new Date().toISOString();

async function checkForSupportReplies() {
try {
const {
data: { user },
error: userError
} = await supabaseClient.auth.getUser();

    if (userError || !user) return;

    const { data: requests, error: requestError } =
        await supabaseClient
            .from("support_requests")
            .select("id")
            .eq("user_id", user.id);

    if (requestError || !requests || requests.length === 0) return;

    const requestIds = requests.map(request => request.id);

    const { data: replies, error: repliesError } =
        await supabaseClient
            .from("support_replies")
            .select("id, request_id, sender_id, message, created_at")
            .in("request_id", requestIds)
            .neq("sender_id", user.id)
            .gt("created_at", lastSupportReplyCheck)
            .order("created_at", { ascending: true });

    if (repliesError) {
        console.error("Support notification check failed:", repliesError);
        return;
    }

    lastSupportReplyCheck = new Date().toISOString();

    if (replies && replies.length > 0) {
        const latestReply = replies[replies.length - 1];

        if ("Notification" in window &&
            Notification.permission === "granted") {
            new Notification("FREE CHAT Support", {
                body: latestReply.message
                    ? "You have a new support reply."
                    : "Your support request has been updated."
            });
        } else {
            console.log("You have a new support reply.");
        }
    }
} catch (error) {
    console.error("Support notification error:", error);
}

}

function startSupportReplyNotifications() {
if (supportReplyCheckTimer) {
clearInterval(supportReplyCheckTimer);
}

checkForSupportReplies();

supportReplyCheckTimer = setInterval(
    checkForSupportReplies,
    60000
);

}

function stopSupportReplyNotifications() {
if (supportReplyCheckTimer) {
clearInterval(supportReplyCheckTimer);
supportReplyCheckTimer = null;
}
}
// Shared logout handler used by the menu and profile/settings screens.
async function logoutFromMenu() {
    if (window.__fcLogoutInProgress) return;
    window.__fcLogoutInProgress = true;

    try {
        const client = window.supabaseClient || window.supabase;
        if (!client || !client.auth || typeof client.auth.signOut !== "function") {
            console.error("[Logout] Supabase client is unavailable.");
            alert("Unable to connect to the sign-in service. Please refresh and try again.");
            return;
        }

        // Best-effort presence cleanup; logging out must still continue if this fails.
        try {
            if (typeof setUserOffline === "function") await setUserOffline();
        } catch (presenceError) {
            console.warn("[Logout] Could not update online status:", presenceError);
        }

        const { error } = await client.auth.signOut();
        if (error) throw error;

        // Clear app-only session flags without touching Supabase configuration.
        try {
            sessionStorage.clear();
        } catch (_) {}

        // This project uses index-fixed.html as its main entry page.
        window.location.replace("index-fixed.html");
    } catch (error) {
        console.error("[Logout] Sign-out failed:", error);
        alert("Logout failed. Check your connection and try again.");
    } finally {
        window.__fcLogoutInProgress = false;
    }
}

window.logoutFromMenu = logoutFromMenu;
window.logoutFromSettings = logoutFromMenu;
window.logout = logoutFromMenu;



/* Compact private voice-message player */
(function () {
  function fmt(t) {
    if (!Number.isFinite(t) || t < 0) return '0:00';
    t = Math.floor(t);
    return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
  }
  window.updatePrivateAudio = function(audio) {
    const box = audio.closest('.private-audio-player');
    if (!box) return;
    const cur = box.querySelector('.private-audio-current');
    const dur = box.querySelector('.private-audio-duration');
    const wave = box.querySelector('.private-audio-wave');
    if (cur) cur.textContent = fmt(audio.currentTime);
    if (dur && Number.isFinite(audio.duration)) dur.textContent = fmt(audio.duration);
    if (wave) wave.style.setProperty('--audio-progress', (audio.duration ? audio.currentTime / audio.duration * 100 : 0) + '%');
  };
  window.togglePrivateAudio = async function(button) {
    const box = button.closest('.private-audio-player');
    const audio = box && box.querySelector('audio');
    if (!audio) return;
    if (audio.paused) {
      document.querySelectorAll('.private-audio-source').forEach(other => {
        if (other !== audio) {
          other.pause();
          const b = other.closest('.private-audio-player')?.querySelector('.private-audio-play');
          if (b) { b.textContent = '▶'; b.setAttribute('aria-label', 'Play voice message'); }
        }
      });
      try { await audio.play(); button.textContent = 'Ⅱ'; button.setAttribute('aria-label', 'Pause voice message'); }
      catch (e) { console.error('[Private audio] Playback failed:', e); }
    } else {
      audio.pause(); button.textContent = '▶'; button.setAttribute('aria-label', 'Play voice message');
    }
  };
  window.seekPrivateAudio = function(event, wave) {
    const box = wave.closest('.private-audio-player');
    const audio = box && box.querySelector('audio');
    if (!audio || !Number.isFinite(audio.duration)) return;
    const rect = wave.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audio.duration;
    window.updatePrivateAudio(audio);
  };
  window.cyclePrivateAudioSpeed = function(button) {
    const box = button.closest('.private-audio-player');
    const audio = box && box.querySelector('audio');
    if (!audio) return;
    const rates = [1, 1.5, 2, 0.5];
    const current = Number(audio.playbackRate) || 1;
    const next = rates[(rates.indexOf(current) + 1) % rates.length];
    audio.playbackRate = next;
    button.textContent = (next === 1 ? '1' : String(next)) + '×';
    button.setAttribute('aria-label', 'Playback speed ' + next + ' times');
  };
  window.finishPrivateAudio = function(audio) {
    const box = audio.closest('.private-audio-player');
    const button = box && box.querySelector('.private-audio-play');
    if (button) { button.textContent = '▶'; button.setAttribute('aria-label', 'Play voice message'); }
    window.updatePrivateAudio(audio);
  };
})();


/* Private chat camera shortcut. On supported mobile browsers, capture=environment
   requests the rear camera; on desktop it may open the normal image chooser. */
function openPrivateCamera() {
    const input = document.getElementById("chatCameraInput");
    if (!input) {
        console.warn("[Camera] Private camera input is missing.");
        return;
    }
    input.value = "";
    input.click();
}
window.openPrivateCamera = openPrivateCamera;


/* =====================================================
   🎥 PRIVATE CHAT VIDEO RECORDING
   Tap the video button to start recording; tap again to
   stop and send through the existing media upload flow.
===================================================== */
let privateVideoRecorder = null;
let privateVideoStream = null;
let privateVideoChunks = [];

function stopPrivateVideoStream() {
    if (privateVideoStream) {
        privateVideoStream.getTracks().forEach(track => track.stop());
        privateVideoStream = null;
    }
}

function resetPrivateVideoRecordButton() {
    const button = document.getElementById("chatVideoRecordButton");
    if (!button) return;
    button.textContent = "🎥";
    button.title = "Record video";
    button.setAttribute("aria-label", "Record a video message");
    button.classList.remove("is-recording");
}

async function togglePrivateVideoRecording() {
    const button = document.getElementById("chatVideoRecordButton");

    if (privateVideoRecorder && privateVideoRecorder.state === "recording") {
        if (button) button.disabled = true;
        privateVideoRecorder.stop();
        return;
    }

    if (!currentConversationId || !currentChatUserId) {
        alert("Please open a chat first.");
        return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia ||
        typeof MediaRecorder === "undefined") {
        alert("Video recording is not supported by this browser. Please use 📎 to choose a video from your device.");
        return;
    }

    try {
        const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
        if (authError) throw authError;
        if (!user) {
            alert("Please login first.");
            return;
        }

        const permission = await canMessageUser(currentChatUserId);
        if (!permission.allowed) {
            alert("🔒 Message unavailable\n\n" + permission.reason);
            return;
        }

        privateVideoStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" } },
            audio: true
        });
        privateVideoChunks = [];

        const mimeCandidates = [
            "video/webm;codecs=vp8,opus",
            "video/webm",
            "video/mp4"
        ];
        let mimeType = "";
        for (const candidate of mimeCandidates) {
            if (MediaRecorder.isTypeSupported(candidate)) {
                mimeType = candidate;
                break;
            }
        }

        privateVideoRecorder = mimeType
            ? new MediaRecorder(privateVideoStream, { mimeType })
            : new MediaRecorder(privateVideoStream);

        privateVideoRecorder.ondataavailable = event => {
            if (event.data && event.data.size > 0) privateVideoChunks.push(event.data);
        };

        privateVideoRecorder.onerror = event => {
            console.error("[Video recording] Recorder error:", event.error || event);
            stopPrivateVideoStream();
            resetPrivateVideoRecordButton();
            if (button) button.disabled = false;
            alert("Video recording failed. Please try again or attach a saved video.");
        };

        privateVideoRecorder.onstop = async () => {
            const recordedType = privateVideoRecorder && privateVideoRecorder.mimeType
                ? privateVideoRecorder.mimeType
                : (mimeType || "video/webm");
            const blob = new Blob(privateVideoChunks, { type: recordedType });
            privateVideoChunks = [];
            stopPrivateVideoStream();
            resetPrivateVideoRecordButton();
            if (button) button.disabled = false;

            if (!blob.size) {
                alert("No video was recorded.");
                return;
            }

            const extension = recordedType.includes("mp4") ? "mp4" : "webm";
            const videoFile = new File(
                [blob],
                `freechat-video-${Date.now()}.${extension}`,
                { type: recordedType }
            );

            if (videoFile.size > 50 * 1024 * 1024) {
                alert("This video is larger than the current 50 MB limit. Please record a shorter video or attach a smaller file.");
                return;
            }

            await handleChatMediaSelected({
                target: { files: [videoFile], value: "" }
            });
        };

        privateVideoRecorder.start(250);
        if (button) {
            button.textContent = "⏹️";
            button.title = "Stop recording and send";
            button.setAttribute("aria-label", "Stop recording and send video");
            button.classList.add("is-recording");
        }
    } catch (error) {
        console.error("[Video recording] Could not start:", error);
        stopPrivateVideoStream();
        resetPrivateVideoRecordButton();
        if (button) button.disabled = false;

        let message = "Could not start video recording.";
        if (error && (error.name === "NotAllowedError" || error.name === "PermissionDeniedError")) {
            message = "Camera or microphone permission was denied. Allow access in your browser settings and try again.";
        } else if (error && error.name === "NotFoundError") {
            message = "No camera was found on this device.";
        } else if (error && error.name === "NotReadableError") {
            message = "The camera may already be in use by another app. Close it and try again.";
        } else if (error && error.message) {
            message += "\n\n" + error.message;
        }
        alert(message);
    }
}
window.togglePrivateVideoRecording = togglePrivateVideoRecording;



/* =========================================================
   FREE CHAT STATUS / STORIES (24-hour expiry)
   Uses the existing post-images Storage bucket.
========================================================= */
let fcStoriesCache = [];
let fcStoryViewIndex = 0;
let fcStoryPreviewUrl = null;
let fcSeenStoryIds = new Set();

function fcStoryEscape(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

function openCreateStory() {
    const modal = document.getElementById('fcCreateStoryModal');
    if (modal) modal.classList.remove('hidden');
    const msg = document.getElementById('fcStoryMessage');
    if (msg) msg.textContent = '';
}
function closeCreateStory() {
    const modal = document.getElementById('fcCreateStoryModal');
    if (modal) modal.classList.add('hidden');
}
function closeViewStory() {
    const modal = document.getElementById('fcViewStoryModal');
    const content = document.getElementById('fcStoryViewerContent');
    if (content) {
        const video = content.querySelector('video');
        if (video) video.pause();
        content.innerHTML = '';
    }
    if (modal) modal.classList.add('hidden');
}
function fcSetStoryMessage(message, isError = false) {
    const node = document.getElementById('fcStoryMessage');
    if (!node) return;
    node.textContent = message;
    node.style.color = isError ? '#dc2626' : '#087443';
}
function fcRenderStoryPreview(file) {
    const box = document.getElementById('fcStoryPreview');
    if (!box) return;
    if (fcStoryPreviewUrl) URL.revokeObjectURL(fcStoryPreviewUrl);
    fcStoryPreviewUrl = URL.createObjectURL(file);
    box.classList.remove('hidden');
    const url = fcStoryPreviewUrl;
    box.innerHTML = file.type.startsWith('video/')
        ? `<video src="${url}" controls playsinline></video>`
        : `<img src="${url}" alt="Status preview">`;
}
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('fcStoryMediaInput');
    if (input) input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        if (!file) return;
        if (!(file.type.startsWith('image/') || file.type.startsWith('video/'))) {
            fcSetStoryMessage('Choose an image or video file.', true);
            input.value = '';
            return;
        }
        if (file.size > 50 * 1024 * 1024) {
            fcSetStoryMessage('Please choose a file smaller than 50 MB.', true);
            input.value = '';
            return;
        }
        fcRenderStoryPreview(file);
        fcSetStoryMessage('');
    });
});

async function publishStory() {
    const button = document.getElementById('fcPublishStoryBtn');
    const input = document.getElementById('fcStoryMediaInput');
    const captionInput = document.getElementById('fcStoryCaption');
    const file = input && input.files && input.files[0];
    if (!file) { fcSetStoryMessage('Choose a photo or video first.', true); return; }

    try {
        if (button) { button.disabled = true; button.textContent = 'Sharing…'; }
        const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
        if (authError) throw authError;
        if (!user) throw new Error('Please log in to share a status.');

        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `stories/${user.id}/${Date.now()}_${safeName}`;
        const { error: uploadError } = await supabaseClient.storage
            .from('post-images')
            .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });
        if (uploadError) throw uploadError;

        const { data: urlData } = supabaseClient.storage.from('post-images').getPublicUrl(path);
        const mediaUrl = urlData && urlData.publicUrl;
        if (!mediaUrl) throw new Error('Could not create a public media URL.');

        const now = new Date();
        const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const payload = {
            user_id: user.id,
            media_url: mediaUrl,
            media_type: file.type.startsWith('video/') ? 'video' : 'image',
            caption: (captionInput?.value || '').trim() || null,
            created_at: now.toISOString(),
            expires_at: expires.toISOString()
        };
        const { error: insertError } = await supabaseClient.from('stories').insert(payload);
        if (insertError) throw insertError;

        if (input) input.value = '';
        if (captionInput) captionInput.value = '';
        const preview = document.getElementById('fcStoryPreview');
        if (preview) { preview.innerHTML = ''; preview.classList.add('hidden'); }
        if (fcStoryPreviewUrl) { URL.revokeObjectURL(fcStoryPreviewUrl); fcStoryPreviewUrl = null; }
        closeCreateStory();
        await loadStories();
        alert('Status shared! It will expire after 24 hours. 💚');
    } catch (error) {
        console.error('[Stories] Publish failed:', error);
        fcSetStoryMessage(error.message || 'Could not share status. Check the stories database setup.', true);
    } finally {
        if (button) { button.disabled = false; button.textContent = 'Share status'; }
    }
}

async function fcMarkStorySeen(story) {
    if (!story || !story.id || !supabaseClient) return;
    try {
        const { data: authData, error: authError } = await supabaseClient.auth.getUser();
        if (authError) throw authError;
        const user = authData?.user;
        if (!user || user.id === story.user_id) return;

        // Do not skip this database check just because a local cache says "seen";
        // the database is the source of truth across refreshes and devices.
        const { error } = await supabaseClient.from('story_views').insert({
            story_id: story.id,
            viewer_id: user.id,
            viewed_at: new Date().toISOString()
        });
        // A duplicate means this viewer has already recorded a view for this story.
        if (error && error.code !== '23505') throw error;

        fcSeenStoryIds.add(story.id);
        const ring = document.querySelector(`[data-story-user="${story.user_id}"] .fc-story-ring`);
        if (ring) ring.classList.add('fc-story-seen');
    } catch (error) {
        console.error('[Stories] Could not record view. Check that SUPABASE-status-stories-migration.sql ran successfully and story_views RLS policies are enabled:', error);
    }
}

async function fcShowStoryViewers() {
    const story = fcStoriesCache[fcStoryViewIndex];
    const content = document.getElementById('fcStoryViewerContent');
    if (!story || !content) return;
    const oldPanel = content.querySelector('.fc-story-viewers-panel');
    if (oldPanel) { oldPanel.remove(); return; }
    const panel = document.createElement('div');
    panel.className = 'fc-story-viewers-panel';
    panel.innerHTML = '<strong>Seen by</strong><p>Loading viewers…</p>';
    content.appendChild(panel);
    try {
        const { data, error } = await supabaseClient.from('story_views')
            .select('viewer_id,viewed_at')
            .eq('story_id', story.id)
            .order('viewed_at', { ascending: false });
        if (error) throw error;
        const rows = data || [];
        const ids = [...new Set(rows.map(row => row.viewer_id))];
        let profiles = [];
        if (ids.length) {
            const result = await supabaseClient.from('profiles').select('id,username,avatar_url').in('id', ids);
            if (!result.error) profiles = result.data || [];
        }
        const profileMap = new Map(profiles.map(profile => [profile.id, profile]));
        panel.innerHTML = `<strong>Seen by ${rows.length}</strong>` + (rows.length
            ? `<ul>${rows.map(row => `<li><span>${fcStoryEscape(profileMap.get(row.viewer_id)?.username || 'FREE CHAT user')}</span><time>${fcStoryEscape(new Date(row.viewed_at).toLocaleString())}</time></li>`).join('')}</ul>`
            : '<p>No views yet.</p>');
        // Reactions are optional: if the reactions migration is installed, show them to the story owner.
        try {
            const reactionResult = await supabaseClient.from('story_reactions')
                .select('user_id,emoji,created_at').eq('story_id', story.id)
                .order('created_at', { ascending: false });
            if (!reactionResult.error) {
                const reactions = reactionResult.data || [];
                const reactionIds = [...new Set(reactions.map(row => row.user_id))];
                let reactionProfiles = [];
                if (reactionIds.length) {
                    const profileResult = await supabaseClient.from('profiles').select('id,username').in('id', reactionIds);
                    if (!profileResult.error) reactionProfiles = profileResult.data || [];
                }
                const reactionNames = new Map(reactionProfiles.map(profile => [profile.id, profile.username || 'FREE CHAT user']));
                panel.insertAdjacentHTML('beforeend', `<div class="fc-story-reactions-summary"><strong>Reactions (${reactions.length})</strong>${reactions.length
                    ? `<ul>${reactions.map(row => `<li><span>${fcStoryEscape(reactionNames.get(row.user_id) || 'FREE CHAT user')} ${fcStoryEscape(row.emoji)}</span><time>${fcStoryEscape(new Date(row.created_at).toLocaleString())}</time></li>`).join('')}</ul>`
                    : '<p>No reactions yet.</p>'}</div>`);
            }
        } catch (reactionError) {
            console.warn('[Stories] Reactions are not available yet:', reactionError.message || reactionError);
        }
    } catch (error) {
        panel.innerHTML = '<strong>Viewers</strong><p>Could not load viewers. Run the status viewers SQL migration and check RLS policies.</p>';
        console.error('[Stories] Viewers load failed:', error);
    }
}
window.fcShowStoryViewers = fcShowStoryViewers;

const FC_STORY_REACTION_EMOJIS = ['❤️', '😂', '😍', '👍', '😮', '😢'];
let fcStoryReactionBusy = false;

async function fcReactToStory(emoji) {
    const story = fcStoriesCache[fcStoryViewIndex];
    if (!story || fcStoryReactionBusy || !FC_STORY_REACTION_EMOJIS.includes(emoji)) return;
    try {
        const { data: authData, error: authError } = await supabaseClient.auth.getUser();
        if (authError) throw authError;
        const user = authData?.user;
        if (!user) throw new Error('Please log in to react to a status.');
        if (user.id === story.user_id) return;
        fcStoryReactionBusy = true;
        const buttons = document.querySelectorAll('.fc-story-reaction-btn');
        buttons.forEach(button => { button.disabled = true; });
        const { error } = await supabaseClient.from('story_reactions').upsert({
            story_id: story.id,
            user_id: user.id,
            emoji,
            created_at: new Date().toISOString()
        }, { onConflict: 'story_id,user_id' });
        if (error) throw error;
        const status = document.getElementById('fcStoryReactionMessage');
        if (status) status.textContent = `You reacted ${emoji}`;
        document.querySelectorAll('.fc-story-reaction-btn').forEach(button => {
            const selected = button.dataset.emoji === emoji;
            button.classList.toggle('is-selected', selected);
            button.setAttribute('aria-pressed', selected ? 'true' : 'false');
        });
    } catch (error) {
        console.error('[Stories] Reaction failed:', error);
        const status = document.getElementById('fcStoryReactionMessage');
        if (status) status.textContent = error.message || 'Could not save reaction. Check the status reactions SQL migration.';
    } finally {
        fcStoryReactionBusy = false;
        document.querySelectorAll('.fc-story-reaction-btn').forEach(button => { button.disabled = false; });
    }
}
window.fcReactToStory = fcReactToStory;

async function fcLoadMyStoryReaction(story, isMine) {
    if (isMine) return null;
    try {
        const { data: authData } = await supabaseClient.auth.getUser();
        if (!authData?.user) return null;
        const { data, error } = await supabaseClient.from('story_reactions')
            .select('emoji').eq('story_id', story.id).eq('user_id', authData.user.id).maybeSingle();
        if (error) throw error;
        return data?.emoji || null;
    } catch (error) {
        console.warn('[Stories] Could not load your reaction:', error.message || error);
        return null;
    }
}

async function loadStories() {
    const rail = document.getElementById('fcStoriesRail');
    if (!rail) return;
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        const now = new Date().toISOString();
        const { data, error } = await supabaseClient.from('stories')
            .select('id,user_id,media_url,media_type,caption,created_at,expires_at')
            .gt('expires_at', now)
            .order('created_at', { ascending: false })
            .limit(100);
        if (error) throw error;
        fcStoriesCache = data || [];
        fcSeenStoryIds = new Set();
        if (user && fcStoriesCache.length) {
            const storyIds = fcStoriesCache.map(story => story.id);
            const seenResult = await supabaseClient.from('story_views')
                .select('story_id').eq('viewer_id', user.id).in('story_id', storyIds);
            if (!seenResult.error) (seenResult.data || []).forEach(row => fcSeenStoryIds.add(row.story_id));
        }

        const ownerIds = [...new Set(fcStoriesCache.map(s => s.user_id))];
        let profiles = [];
        if (ownerIds.length) {
            const result = await supabaseClient.from('profiles')
                .select('id,username,avatar_url')
                .in('id', ownerIds);
            if (!result.error) profiles = result.data || [];
        }
        const profileMap = new Map(profiles.map(p => [p.id, p]));
        const grouped = [];
        const seen = new Set();
        for (const story of fcStoriesCache) {
            if (seen.has(story.user_id)) continue;
            seen.add(story.user_id);
            grouped.push({ ...story, owner: profileMap.get(story.user_id) || {}, isMine: user?.id === story.user_id });
        }
        const myStory = grouped.find(s => s.isMine);
        const others = grouped.filter(s => !s.isMine);
        const ordered = [...(myStory ? [myStory] : []), ...others];
        const addCard = `<button type="button" class="fc-story-add-card" onclick="openCreateStory()"><span class="fc-story-add-icon">＋</span><span>My status</span></button>`;
        rail.innerHTML = addCard + (ordered.length ? ordered.map(s => {
            const name = s.isMine ? 'My status' : (s.owner.username || 'Friend');
            const media = s.media_type === 'video'
                ? `<video src="${fcStoryEscape(s.media_url)}" muted playsinline></video>`
                : `<img src="${fcStoryEscape(s.media_url)}" alt="">`;
            const seenClass = fcSeenStoryIds.has(s.id) ? ' fc-story-seen' : '';
            return `<button type="button" class="fc-story-card" data-story-user="${fcStoryEscape(s.user_id)}" onclick="openStoryByUser('${fcStoryEscape(s.user_id)}')" aria-label="View ${fcStoryEscape(name)} status"><span class="fc-story-ring${seenClass}">${media}</span><span>${fcStoryEscape(name)}</span></button>`;
        }).join('') : `<span class="fc-stories-loading">No statuses yet. Share the first one!</span>`);
    } catch (error) {
        console.error('[Stories] Load failed:', error);
        rail.innerHTML = `<button type="button" class="fc-story-add-card" onclick="openCreateStory()"><span class="fc-story-add-icon">＋</span><span>My status</span></button><span class="fc-stories-loading">Statuses need the stories SQL setup.</span>`;
    }
}
function openStoryByUser(userId) {
    fcStoryViewIndex = fcStoriesCache.findIndex(s => s.user_id === userId);
    if (fcStoryViewIndex < 0) return;
    renderCurrentStory();
}
function renderCurrentStory() {
    const story = fcStoriesCache[fcStoryViewIndex];
    if (!story) { closeViewStory(); return; }
    const modal = document.getElementById('fcViewStoryModal');
    const content = document.getElementById('fcStoryViewerContent');
    const bar = document.getElementById('fcStoryProgressBar');
    if (!modal || !content) return;
    content.innerHTML = '<div class="fc-story-viewer-owner">Loading status…</div>';
    const profilePromise = supabaseClient.from('profiles').select('username').eq('id', story.user_id).maybeSingle();
    profilePromise.then(async ({ data }) => {
        const name = data?.username || 'FREE CHAT user';
        const media = story.media_type === 'video'
            ? `<video src="${fcStoryEscape(story.media_url)}" controls autoplay playsinline></video>`
            : `<img src="${fcStoryEscape(story.media_url)}" alt="Status">`;
        const { data: authData } = await supabaseClient.auth.getUser();
        const isMine = authData?.user?.id === story.user_id;
        const myReaction = await fcLoadMyStoryReaction(story, isMine);
        const reactionBar = !isMine ? `<div class="fc-story-reaction-bar" aria-label="React to this status">${FC_STORY_REACTION_EMOJIS.map(emoji => `<button type="button" class="fc-story-reaction-btn${myReaction === emoji ? ' is-selected' : ''}" data-emoji="${emoji}" aria-label="React ${emoji}" aria-pressed="${myReaction === emoji ? 'true' : 'false'}" onclick="fcReactToStory('${emoji}')">${emoji}</button>`).join('')}<p id="fcStoryReactionMessage" role="status">${myReaction ? `Your reaction: ${myReaction}` : 'Tap an emoji to react'}</p></div>` : '';
        content.innerHTML = `<div class="fc-story-viewer-owner">${fcStoryEscape(name)} · ${fcStoryEscape(new Date(story.created_at).toLocaleString())}</div>${media}${story.caption ? `<div class="fc-story-viewer-caption">${fcStoryEscape(story.caption)}</div>` : ''}${reactionBar}${isMine ? `<button type="button" class="fc-story-viewers-toggle" onclick="fcShowStoryViewers()">👁 Viewers & reactions</button>` : ''}`;
        if (!isMine) await fcMarkStorySeen(story);
    }).catch(error => console.warn('[Stories] Could not render status details:', error));
    if (bar) { bar.style.transition = 'none'; bar.style.width = '100%'; }
    modal.classList.remove('hidden');
}
function nextStory() {
    if (fcStoryViewIndex + 1 < fcStoriesCache.length) {
        fcStoryViewIndex++;
        renderCurrentStory();
    } else closeViewStory();
}
window.openCreateStory = openCreateStory;
window.closeCreateStory = closeCreateStory;
window.publishStory = publishStory;
window.loadStories = loadStories;
window.openStoryByUser = openStoryByUser;
window.closeViewStory = closeViewStory;
window.nextStory = nextStory;


/* ==========================================
   🎮 GAME CENTRE HUB NAVIGATION
========================================== */
function openGameCentreScreen(){
  const menu=document.getElementById('mainMenuScreen');
  const home=document.getElementById('homeScreen');
  const hub=document.getElementById('gameCentreScreen');
  if(menu) menu.classList.add('hidden');
  if(home) home.classList.add('hidden');
  if(hub) hub.classList.remove('hidden');
  window.scrollTo({top:0,behavior:'instant'});
}
function closeGameCentreScreen(){
  const hub=document.getElementById('gameCentreScreen');
  const menu=document.getElementById('mainMenuScreen');
  if(hub) hub.classList.add('hidden');
  if(menu) menu.classList.remove('hidden');
}
function openGameCentreParty(){
  // Games currently run inside Live Party rooms so every room member shares the same round.
  window.location.href='voice-rooms.html';
}

/* Game Centre catalogue tabs and safe placeholder actions */
function switchGameCentreTab(tab,button){
  const panels={games:'gcGamesPanel',rooms:'gcRoomsPanel',rankings:'gcRankingsPanel',wins:'gcWinsPanel'};
  Object.values(panels).forEach(id=>{const el=document.getElementById(id);if(el)el.classList.add('hidden')});
  const target=document.getElementById(panels[tab]);if(target)target.classList.remove('hidden');
  document.querySelectorAll('.game-centre-tabs button').forEach(el=>el.classList.remove('active'));
  if(button)button.classList.add('active');
}
function gameCentreComingSoon(name){
  const message=(name||'This game')+' is coming soon to FREE CHAT Game Centre.';
  if(typeof showToast==='function')showToast(message);else alert(message);
}
function showGameCentreInfo(){
  const message='FREE CHAT Game Centre\n\nGames shown as COMING SOON are catalogue previews and are not playable yet. Fruit Turntable is the currently connected game. This version has no recharge, withdrawal or cash-prize features.';
  if(typeof showToast==='function')showToast(message);else alert(message);
}
window.switchGameCentreTab=switchGameCentreTab;
window.gameCentreComingSoon=gameCentreComingSoon;
window.showGameCentreInfo=showGameCentreInfo;
