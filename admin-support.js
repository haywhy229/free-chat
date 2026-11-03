var adminSupabase = window.supabaseClient;

const requestsContainer = document.getElementById("supportRequests");
const inboxStatus = document.getElementById("inboxStatus");
const refreshButton = document.getElementById("refreshButton");
const backButton = document.getElementById("backButton");

let currentAdminId = null;

backButton.addEventListener("click", () => {
window.location.href = "index-fixed.html";
});

refreshButton.addEventListener("click", loadSupportRequests);

async function loadSupportRequests() {
requestsContainer.innerHTML = "";
inboxStatus.textContent = "Loading support requests...";

try {
    const { data: { user }, error: userError } =
        await supabaseClient.auth.getUser();

    if (userError || !user) {
        inboxStatus.textContent =
            "Please log in to FREE CHAT first, then open this page again.";
        return;
    }

    const { data: { session } } =
        await supabaseClient.auth.getSession();

    if (!session) {
        inboxStatus.textContent =
            "Your session has expired. Please log in again.";
        return;
    }

    const role = user.app_metadata?.role;

    if (role !== "admin") {
        inboxStatus.textContent =
            "Access denied. This page is for administrators only.";
        return;
    }

    currentAdminId = user.id;

    const { data: requests, error } = await supabaseClient
        .from("support_requests")
        .select("id, user_id, subject, message, status, created_at")
        .order("created_at", { ascending: false });

    if (error) throw error;

    if (!requests || requests.length === 0) {
        inboxStatus.textContent = "No support requests yet.";
        return;
    }

    const userIds = [...new Set(requests.map(r => r.user_id))];

    const { data: profiles, error: profileError } =
    await adminSupabase
        .from("profiles")
        .select("id, username")
        .in("id", userIds);
    
    if (profileError) {
        console.warn("Could not load profile names:", profileError);
    }

    const profileMap = new Map(
        (profiles || []).map(profile => [
            profile.id,
profile.username || "FREE CHAT user"
        ])
    );

    inboxStatus.textContent =
        `${requests.length} support request(s) found.`;

    for (const request of requests) {
        await renderSupportRequest(request, profileMap.get(request.user_id));
    }

} catch (error) {
    console.error("Admin support inbox error:", error);
    inboxStatus.textContent =
        "Could not load requests. Check your connection and permissions.";
}

}

async function renderSupportRequest(request, username) {
const card = document.createElement("article");
card.className = "support-card";

const heading = document.createElement("h3");
heading.textContent = request.subject || "Support request";

const user = document.createElement("p");
user.className = "user-name";
user.textContent = `From: ${username || "FREE CHAT user"}`;

const date = document.createElement("p");
date.textContent = new Date(request.created_at).toLocaleString();

const message = document.createElement("p");
message.className = "request-message";
message.textContent = request.message;

const statusRow = document.createElement("div");
statusRow.className = "status-row";

const statusSelect = document.createElement("select");
statusSelect.className = "status-select";

["open", "in_progress", "resolved"].forEach(status => {
    const option = document.createElement("option");
    option.value = status;
    option.textContent = status.replace("_", " ");
    option.selected = status === request.status;
    statusSelect.appendChild(option);
});

const saveStatus = document.createElement("button");
saveStatus.className = "save-button";
saveStatus.type = "button";
saveStatus.textContent = "Save status";

saveStatus.addEventListener("click", async () => {
    saveStatus.disabled = true;
    saveStatus.textContent = "Saving...";

    try {
        const { error } = await supabaseClient
            .from("support_requests")
            .update({ status: statusSelect.value })
            .eq("id", request.id);

        if (error) throw error;

        request.status = statusSelect.value;
        saveStatus.textContent = "Saved ✓";
    } catch (error) {
        console.error("Status update error:", error);
        saveStatus.textContent = "Failed — retry";
    } finally {
        saveStatus.disabled = false;
    }
});

statusRow.append(statusSelect, saveStatus);

const repliesHeading = document.createElement("h4");
repliesHeading.textContent = "Conversation";

const replyList = document.createElement("div");
replyList.className = "reply-list";

const replyInput = document.createElement("textarea");
replyInput.className = "reply-input";
replyInput.placeholder = "Write a reply to this user...";
replyInput.maxLength = 5000;
replyInput.rows = 3;

const sendReply = document.createElement("button");
sendReply.className = "save-button";
sendReply.type = "button";
sendReply.textContent = "Send reply";

async function loadReplies() {
    replyList.innerHTML = "";

    const { data: replies, error } = await supabaseClient
        .from("support_replies")
        .select("id, sender_id, message, created_at")
        .eq("request_id", request.id)
        .order("created_at", { ascending: true });

    if (error) {
        console.error("Reply loading error:", error);
        replyList.textContent = "Could not load replies.";
        return;
    }

    if (!replies || replies.length === 0) {
        replyList.textContent = "No replies yet.";
        return;
    }

    replies.forEach(reply => {
        const item = document.createElement("div");
        item.className = "reply-item";

        const label = document.createElement("strong");
        label.textContent =
            reply.sender_id === currentAdminId ? "Admin" : "User";

        const body = document.createElement("p");
        body.textContent = reply.message;

        const time = document.createElement("small");
        time.textContent = new Date(reply.created_at).toLocaleString();

        item.append(label, body, time);
        replyList.appendChild(item);
    });
}

sendReply.addEventListener("click", async () => {
    const replyText = replyInput.value.trim();

    if (!replyText) {
        replyInput.focus();
        return;
    }

    sendReply.disabled = true;
    sendReply.textContent = "Sending...";

    try {
        const { error } = await supabaseClient
            .from("support_replies")
            .insert({
                request_id: request.id,
                sender_id: currentAdminId,
                message: replyText
            });

        if (error) throw error;

        replyInput.value = "";
        await loadReplies();
        sendReply.textContent = "Reply sent ✓";

    } catch (error) {
        console.error("Sending reply error:", error);
        sendReply.textContent = "Failed — retry";
    } finally {
        sendReply.disabled = false;
    }
});

card.append(
    heading,
    user,
    date,
    message,
    statusRow,
    repliesHeading,
    replyList,
    replyInput,
    sendReply
);

requestsContainer.appendChild(card);

await loadReplies();

}

if (supabaseClient) {
loadSupportRequests();
} else {
inboxStatus.textContent =
"Supabase is not initialized. Please check supabase.js.";
}