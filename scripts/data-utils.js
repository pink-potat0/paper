// Server-backed data helpers used by course progress, chat history, and profile UI.
(function (global) {
    "use strict";

    var base = global.PAPER_API_BASE ? String(global.PAPER_API_BASE).replace(/\/$/, "") : "";
    global.__paperDataReadyPromise = Promise.resolve();

    function api(path, options) {
        return fetch(base + path, Object.assign({
            credentials: "same-origin",
            headers: { "content-type": "application/json", "accept": "application/json" }
        }, options || {})).then(function (response) {
            return response.json().catch(function () {
                return {};
            }).then(function (body) {
                if (!response.ok) {
                    throw new Error(body.error || "Request failed with HTTP " + response.status);
                }
                return body;
            });
        });
    }

    function qs(params) {
        var query = new URLSearchParams();
        Object.keys(params || {}).forEach(function (key) {
            if (params[key] !== undefined && params[key] !== null && params[key] !== "") {
                query.set(key, params[key]);
            }
        });
        var value = query.toString();
        return value ? "?" + value : "";
    }

    async function saveUserProfile(userId, userData) {
        try {
            await api("/api/data/profile", {
                method: "POST",
                body: JSON.stringify({ userId: userId, profile: userData || {} })
            });
            return true;
        } catch (error) {
            console.error("Error saving user profile:", error);
            return false;
        }
    }

    async function isUsernameAvailable(username, userId) {
        try {
            var body = await api("/api/data/username-available" + qs({ username: username, userId: userId }));
            return Boolean(body.available);
        } catch (error) {
            console.error("Error checking username:", error);
            return null;
        }
    }

    async function getUserProfile(userId) {
        try {
            var body = await api("/api/data/profile" + qs({ userId: userId }), { method: "GET" });
            return body.profile || null;
        } catch (error) {
            console.error("Error getting user profile:", error);
            return null;
        }
    }

    async function updateUsername(userId, newUsername) {
        try {
            await api("/api/data/profile/username", {
                method: "PATCH",
                body: JSON.stringify({ userId: userId, username: newUsername })
            });
            return true;
        } catch (error) {
            console.error("Error updating username:", error);
            return false;
        }
    }

    async function saveLessonProgress(userId, lessonId, progressData) {
        try {
            await api("/api/data/lessons/" + encodeURIComponent(lessonId), {
                method: "POST",
                body: JSON.stringify({ userId: userId, progress: progressData || {} })
            });
            return true;
        } catch (error) {
            console.error("Error saving lesson progress:", error);
            return false;
        }
    }

    async function getLessonProgress(userId, lessonId) {
        try {
            var body = await api(
                "/api/data/lessons/" + encodeURIComponent(lessonId) + qs({ userId: userId }),
                { method: "GET" }
            );
            return body.progress || null;
        } catch (error) {
            console.error("Error getting lesson progress:", error);
            return null;
        }
    }

    async function getAllLessonsProgress(userId) {
        try {
            var body = await api("/api/data/lessons" + qs({ userId: userId }), { method: "GET" });
            return body.progress || {};
        } catch (error) {
            console.error("Error getting all lessons progress:", error);
            return {};
        }
    }

    async function completeLesson(userId, lessonId, score) {
        return saveLessonProgress(userId, lessonId, {
            completed: true,
            score: score,
            completedAt: new Date().toISOString()
        });
    }

    async function savePracticeSession(userId, sessionData) {
        try {
            var body = await api("/api/data/practice-sessions", {
                method: "POST",
                body: JSON.stringify({ userId: userId, session: sessionData || {} })
            });
            return body.id || null;
        } catch (error) {
            console.error("Error saving practice session:", error);
            return null;
        }
    }

    async function getPracticeSessions(userId, limit) {
        try {
            var body = await api("/api/data/practice-sessions" + qs({ userId: userId, limit: limit }), { method: "GET" });
            return body.sessions || [];
        } catch (error) {
            console.error("Error getting practice sessions:", error);
            return [];
        }
    }

    async function updateUserProgressStats(userId) {
        return Boolean(await getUserStats(userId));
    }

    async function getUserStats(userId) {
        try {
            var body = await api("/api/data/stats" + qs({ userId: userId }), { method: "GET" });
            return body.stats || null;
        } catch (error) {
            console.error("Error getting user stats:", error);
            return null;
        }
    }

    async function saveChatMessage(userId, message, isUser) {
        try {
            var body = await api("/api/data/chat", {
                method: "POST",
                body: JSON.stringify({ userId: userId, message: message, isUser: isUser !== false })
            });
            return body.id || null;
        } catch (error) {
            console.error("Error saving chat message:", error);
            return null;
        }
    }

    async function getChatHistory(userId, limit) {
        try {
            var body = await api("/api/data/chat" + qs({ userId: userId, limit: limit }), { method: "GET" });
            return body.messages || [];
        } catch (error) {
            console.error("Error getting chat history:", error);
            return [];
        }
    }

    global.saveUserProfile = saveUserProfile;
    global.isUsernameAvailable = isUsernameAvailable;
    global.getUserProfile = getUserProfile;
    global.updateUsername = updateUsername;
    global.saveLessonProgress = saveLessonProgress;
    global.getLessonProgress = getLessonProgress;
    global.getAllLessonsProgress = getAllLessonsProgress;
    global.completeLesson = completeLesson;
    global.savePracticeSession = savePracticeSession;
    global.getPracticeSessions = getPracticeSessions;
    global.updateUserProgressStats = updateUserProgressStats;
    global.getUserStats = getUserStats;
    global.saveChatMessage = saveChatMessage;
    global.getChatHistory = getChatHistory;
})(window);
