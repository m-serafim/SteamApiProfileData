import { useState } from "react";

interface SteamProfile {
    personaname: string;
    profileurl: string;
    avatarfull: string;
    personastate: number;
    lastlogoff?: number;
    timecreated?: number;
    loccountrycode?: string;
    realname?: string;
    commentpermission?: number;
    profilestate?: number;
}

interface ProfileData {
    profile: SteamProfile;
    level?: number;
    badges?: number;
    gamesCount?: number;
    recentGames?: Array<{
        name: string;
        playtime_forever: number;
        playtime_2weeks: number;
        img_icon_url: string;
        appid: number;
    }>;
    topGames?: Array<{
        name: string;
        playtime_forever: number;
        img_icon_url: string;
        appid: number;
    }>;
}

function App() {
    const [profileInput, setProfileInput] = useState("");
    const [profileData, setProfileData] = useState<ProfileData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const STEAM_API_KEY = "A006ACDA16070433EBB65D9A1645C077";
    const CORS_PROXY = "https://corsproxy.io/?url=";

    const getPersonaStateText = (state: number) => {
        const states: { [key: number]: string } = {
            0: "Offline",
            1: "Online",
            2: "Busy",
            3: "Away",
            4: "Snooze",
            5: "Looking to Trade",
            6: "Looking to Play"
        };
        return states[state] || "Unknown";
    };

    const getPersonaStateColor = (state: number) => {
        if (state === 1) return "#22c55e";
        if (state === 0) return "#6b7280";
        return "#f59e0b";
    };

    const formatPlaytime = (minutes: number) => {
        if (minutes < 60) return `${minutes}m`;
        const hours = Math.floor(minutes / 60);
        if (hours < 1000) return `${hours}h`;
        return `${(hours / 1000).toFixed(1)}k hrs`;
    };

    const fetchProfile = async () => {
        if (!profileInput.trim()) {
            setError("Please enter something!");
            return;
        }

        setLoading(true);
        setError("");
        setProfileData(null);

        try {
            let steamId = "";

            if (/^\d{17}$/.test(profileInput)) {
                steamId = profileInput;
            } else if (profileInput.includes("/profiles/")) {
                const match = profileInput.match(/profiles\/(\d{17})/);
                if (match) steamId = match[1];
            } else if (profileInput.includes("/id/")) {
                const match = profileInput.match(/id\/([^\/\?]+)/);
                if (match) {
                    const vanityUrl = match[1];
                    const vanityApiUrl = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${STEAM_API_KEY}&vanityurl=${vanityUrl}`;
                    const vanityRes = await fetch(CORS_PROXY + encodeURIComponent(vanityApiUrl));
                    if (!vanityRes.ok) {
                        throw new Error(`API returned status ${vanityRes.status}`);
                    }
                    const vanityData = await vanityRes.json();
                    if (vanityData.response.success === 1) {
                        steamId = vanityData.response.steamid;
                    }
                }
            } else {
                const cleanInput = profileInput.replace(/[^a-zA-Z0-9_-]/g, '');
                const vanityApiUrl = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${STEAM_API_KEY}&vanityurl=${cleanInput}`;
                const vanityRes = await fetch(CORS_PROXY + encodeURIComponent(vanityApiUrl));
                if (!vanityRes.ok) {
                    throw new Error(`API returned status ${vanityRes.status}`);
                }
                const vanityData = await vanityRes.json();
                if (vanityData.response.success === 1) {
                    steamId = vanityData.response.steamid;
                }
            }

            if (!steamId) {
                setError("Couldn't find that profile. Try a different link or ID.");
                setLoading(false);
                return;
            }

            const profileApiUrl = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_API_KEY}&steamids=${steamId}`;
            const res = await fetch(CORS_PROXY + encodeURIComponent(profileApiUrl));
            const data = await res.json();

            if (data.response.players && data.response.players.length > 0) {
                const playerProfile = data.response.players[0];

                const [levelRes, badgesRes, gamesRes, recentGamesRes] = await Promise.all([
                    fetch(CORS_PROXY + encodeURIComponent(
                        `https://api.steampowered.com/IPlayerService/GetSteamLevel/v1/?key=${STEAM_API_KEY}&steamid=${steamId}`
                    )).catch(() => null),
                    fetch(CORS_PROXY + encodeURIComponent(
                        `https://api.steampowered.com/IPlayerService/GetBadges/v1/?key=${STEAM_API_KEY}&steamid=${steamId}`
                    )).catch(() => null),
                    fetch(CORS_PROXY + encodeURIComponent(
                        `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${STEAM_API_KEY}&steamid=${steamId}&include_appinfo=1&include_played_free_games=1`
                    )).catch(() => null),
                    fetch(CORS_PROXY + encodeURIComponent(
                        `https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v1/?key=${STEAM_API_KEY}&steamid=${steamId}&count=6`
                    )).catch(() => null)
                ]);

                const levelData = levelRes ? await levelRes.json().catch(() => null) : null;
                const badgesData = badgesRes ? await badgesRes.json().catch(() => null) : null;
                const gamesData = gamesRes ? await gamesRes.json().catch(() => null) : null;
                const recentGamesData = recentGamesRes ? await recentGamesRes.json().catch(() => null) : null;

                const games = gamesData?.response?.games || [];
                const topGames = games
                    .sort((a: any, b: any) => b.playtime_forever - a.playtime_forever)
                    .slice(0, 5);

                setProfileData({
                    profile: playerProfile,
                    level: levelData?.response?.player_level,
                    badges: badgesData?.response?.badges?.length,
                    gamesCount: gamesData?.response?.game_count,
                    recentGames: recentGamesData?.response?.games || [],
                    topGames: topGames
                });
            } else {
                setError("Profile not found or is private.");
            }
        } catch (err) {
            console.error("Error fetching profile:", err);

            const errorMessage = err instanceof Error ? err.message : String(err);

            if (err instanceof TypeError && errorMessage.includes('fetch')) {
                setError("Network error: Unable to connect to Steam API. Check your internet connection.");
            } else if (errorMessage.includes('status')) {
                setError("Steam API error: The service returned an error. Please try again later.");
            } else {
                setError("Something went wrong. The API might be down or the profile is private.");
            }
        } finally {
            setLoading(false);
        }
    };

    const totalPlaytime = profileData?.topGames?.reduce((sum, game) => sum + game.playtime_forever, 0) || 0;

    return (
        <div style={{
            minHeight: '100vh',
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            overflow: 'hidden',
            background: '#000',
            fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}>
            <div style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(135deg, #0a0a0f 0%, #050508 50%, #000 100%)',
                opacity: 0.95
            }}></div>

            <div style={{
                position: 'absolute',
                inset: 0,
                background: 'radial-gradient(ellipse at 20% 30%, rgba(59, 130, 246, 0.08), transparent 50%)'
            }}></div>

            <div style={{
                position: 'absolute',
                inset: 0,
                background: 'radial-gradient(ellipse at 80% 70%, rgba(139, 92, 246, 0.08), transparent 50%)'
            }}></div>

            <div style={{
                position: 'absolute',
                top: '10%',
                left: '5%',
                width: '300px',
                height: '300px',
                background: 'radial-gradient(circle, rgba(59, 130, 246, 0.15), transparent 70%)',
                borderRadius: '50%',
                filter: 'blur(80px)',
                animation: 'float 8s ease-in-out infinite'
            }}></div>

            <div style={{
                position: 'absolute',
                bottom: '15%',
                right: '10%',
                width: '400px',
                height: '400px',
                background: 'radial-gradient(circle, rgba(139, 92, 246, 0.15), transparent 70%)',
                borderRadius: '50%',
                filter: 'blur(80px)',
                animation: 'float 8s ease-in-out infinite 2s'
            }}></div>

            <style>{`
        @keyframes float {
          0%, 100% { 
            transform: translate(0, 0) scale(1);
            opacity: 0.3;
          }
          33% { 
            transform: translate(30px, -30px) scale(1.1);
            opacity: 0.5;
          }
          66% { 
            transform: translate(-20px, 20px) scale(0.9);
            opacity: 0.4;
          }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes gradient {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @keyframes shimmer {
          0% { background-position: -1000px 0; }
          100% { background-position: 1000px 0; }
        }
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .fade-in-up {
          animation: fadeInUp 0.8s ease-out forwards;
        }
      `}</style>

            <div style={{
                position: 'relative',
                zIndex: 10,
                width: '100%',
                padding: '24px 5%',
                display: 'flex',
                flexDirection: 'column',
                minHeight: '100vh',
                boxSizing: 'border-box'
            }}>
                <div style={{ textAlign: 'center', marginBottom: '48px' }} className="fade-in-up">
                    <h1 style={{
                        fontSize: '72px',
                        fontWeight: 700,
                        marginBottom: '12px',
                        background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 50%, #3b82f6 100%)',
                        backgroundSize: '200% auto',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                        animation: 'gradient 4s ease infinite',
                        letterSpacing: '-3px',
                        lineHeight: '1.1'
                    }}>
                        Steam Lookup
                    </h1>
                    <p style={{
                        fontSize: '18px',
                        color: '#71717a',
                        fontWeight: 400,
                        letterSpacing: '2px',
                        textTransform: 'uppercase'
                    }}>
                        Discover any Steam profile in seconds
                    </p>
                </div>

                <div style={{ maxWidth: '768px', margin: '0 auto 48px', width: '100%' }}>
                    <div style={{ position: 'relative' }}>
                        <div style={{
                            position: 'absolute',
                            inset: '-2px',
                            background: 'linear-gradient(90deg, rgba(59, 130, 246, 0.2), rgba(139, 92, 246, 0.2))',
                            borderRadius: '20px',
                            filter: 'blur(20px)',
                            opacity: 0.6
                        }}></div>

                        <div style={{
                            position: 'relative',
                            background: 'rgba(10, 10, 15, 0.6)',
                            backdropFilter: 'blur(40px)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            borderRadius: '20px',
                            padding: '40px'
                        }}>
                            <input
                                type="text"
                                placeholder="Enter Steam profile URL or username..."
                                value={profileInput}
                                onChange={(e) => setProfileInput(e.target.value)}
                                onKeyPress={(e) => e.key === "Enter" && fetchProfile()}
                                style={{
                                    width: '100%',
                                    background: 'rgba(255, 255, 255, 0.03)',
                                    border: '1px solid rgba(255, 255, 255, 0.08)',
                                    borderRadius: '14px',
                                    padding: '18px 24px',
                                    color: 'white',
                                    fontSize: '17px',
                                    marginBottom: '20px',
                                    outline: 'none',
                                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                    boxSizing: 'border-box',
                                    fontWeight: 400
                                }}
                                onFocus={(e) => {
                                    e.target.style.borderColor = 'rgba(59, 130, 246, 0.4)';
                                    e.target.style.background = 'rgba(255, 255, 255, 0.05)';
                                }}
                                onBlur={(e) => {
                                    e.target.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                                    e.target.style.background = 'rgba(255, 255, 255, 0.03)';
                                }}
                            />

                            <button
                                onClick={fetchProfile}
                                disabled={loading}
                                style={{
                                    width: '100%',
                                    background: loading ? 'rgba(255, 255, 255, 0.05)' : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                                    color: 'white',
                                    fontWeight: 600,
                                    fontSize: '17px',
                                    padding: '18px',
                                    borderRadius: '14px',
                                    border: 'none',
                                    cursor: loading ? 'not-allowed' : 'pointer',
                                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                    boxShadow: loading ? 'none' : '0 10px 40px rgba(59, 130, 246, 0.3)',
                                    transform: loading ? 'scale(1)' : 'scale(1)',
                                    opacity: loading ? 0.6 : 1
                                }}
                                onMouseEnter={(e) => !loading && (e.currentTarget.style.transform = 'translateY(-2px)')}
                                onMouseLeave={(e) => !loading && (e.currentTarget.style.transform = 'translateY(0)')}
                            >
                                {loading ? (
                                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                                        <span style={{
                                            display: 'inline-block',
                                            width: '18px',
                                            height: '18px',
                                            border: '2px solid rgba(255, 255, 255, 0.3)',
                                            borderTopColor: 'white',
                                            borderRadius: '50%',
                                            animation: 'spin 0.6s linear infinite'
                                        }}></span>
                                        Searching...
                                    </span>
                                ) : (
                                    "Find Profile"
                                )}
                            </button>
                        </div>
                    </div>

                    {error && (
                        <div style={{
                            marginTop: '24px',
                            background: 'rgba(239, 68, 68, 0.08)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            borderRadius: '16px',
                            padding: '20px',
                            color: '#fca5a5',
                            textAlign: 'center',
                            backdropFilter: 'blur(20px)',
                            fontWeight: 500
                        }}>
                            <span style={{ fontSize: '20px', marginRight: '8px' }}>⚠️</span> {error}
                        </div>
                    )}
                </div>

                {profileData && (
                    <div style={{ width: '100%', maxWidth: '1400px', margin: '0 auto' }} className="fade-in-up">
                        <div style={{ position: 'relative' }}>
                            <div style={{
                                position: 'absolute',
                                inset: '-2px',
                                background: 'linear-gradient(90deg, rgba(59, 130, 246, 0.15), rgba(139, 92, 246, 0.15))',
                                borderRadius: '28px',
                                filter: 'blur(25px)',
                                opacity: 0.5
                            }}></div>

                            <div style={{
                                position: 'relative',
                                background: 'rgba(10, 10, 15, 0.6)',
                                backdropFilter: 'blur(40px)',
                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                borderRadius: '28px',
                                padding: '48px'
                            }}>

                                <div style={{
                                    display: 'flex',
                                    flexDirection: window.innerWidth < 768 ? 'column' : 'row',
                                    alignItems: window.innerWidth < 768 ? 'center' : 'flex-start',
                                    gap: '40px',
                                    marginBottom: '48px'
                                }}>
                                    <div style={{ position: 'relative' }}>
                                        <div style={{
                                            position: 'absolute',
                                            inset: '-3px',
                                            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                                            borderRadius: '20px',
                                            filter: 'blur(12px)',
                                            opacity: 0.6
                                        }}></div>
                                        <img
                                            src={profileData.profile.avatarfull}
                                            alt="Avatar"
                                            style={{
                                                position: 'relative',
                                                width: '140px',
                                                height: '140px',
                                                borderRadius: '20px',
                                                border: '2px solid rgba(255, 255, 255, 0.1)'
                                            }}
                                        />
                                    </div>

                                    <div style={{
                                        flex: 1,
                                        textAlign: window.innerWidth < 768 ? 'center' : 'left'
                                    }}>
                                        <h2 style={{
                                            fontSize: '52px',
                                            fontWeight: 700,
                                            color: 'white',
                                            marginBottom: '8px',
                                            letterSpacing: '-2px'
                                        }}>
                                            {profileData.profile.personaname}
                                        </h2>
                                        {profileData.profile.realname && (
                                            <p style={{ fontSize: '20px', color: '#71717a', marginBottom: '20px', fontWeight: 400 }}>
                                                {profileData.profile.realname}
                                            </p>
                                        )}
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: window.innerWidth < 768 ? 'center' : 'flex-start',
                                            gap: '12px',
                                            marginBottom: '28px'
                                        }}>
                                            <div style={{
                                                width: '10px',
                                                height: '10px',
                                                borderRadius: '50%',
                                                background: getPersonaStateColor(profileData.profile.personastate),
                                                boxShadow: profileData.profile.personastate === 1 ? '0 0 12px #22c55e' : 'none',
                                                animation: 'float 2s ease-in-out infinite'
                                            }}></div>
                                            <span style={{ fontSize: '16px', color: '#a1a1aa', fontWeight: 500 }}>
                                                {getPersonaStateText(profileData.profile.personastate)}
                                            </span>
                                        </div>
                                        <a
                                            href={profileData.profile.profileurl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{
                                                display: 'inline-block',
                                                padding: '14px 36px',
                                                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                                                color: 'white',
                                                fontWeight: 600,
                                                borderRadius: '14px',
                                                textDecoration: 'none',
                                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                                boxShadow: '0 10px 30px rgba(59, 130, 246, 0.3)',
                                                fontSize: '16px'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                                            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                                        >
                                            View Steam Profile →
                                        </a>
                                    </div>
                                </div>

                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: window.innerWidth < 768 ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))',
                                    gap: '20px',
                                    marginBottom: '40px'
                                }}>
                                    {profileData.level !== undefined && (
                                        <div style={{
                                            background: 'rgba(59, 130, 246, 0.06)',
                                            border: '1px solid rgba(59, 130, 246, 0.2)',
                                            borderRadius: '20px',
                                            padding: '28px',
                                            textAlign: 'center',
                                            backdropFilter: 'blur(20px)',
                                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                                        }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.transform = 'translateY(-4px)';
                                                e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.transform = 'translateY(0)';
                                                e.currentTarget.style.background = 'rgba(59, 130, 246, 0.06)';
                                            }}
                                        >
                                            <div style={{ fontSize: '56px', fontWeight: 700, color: '#60a5fa', marginBottom: '8px' }}>
                                                {profileData.level}
                                            </div>
                                            <div style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '1.5px', color: '#71717a', fontWeight: 600 }}>
                                                Steam Level
                                            </div>
                                        </div>
                                    )}
                                    {profileData.gamesCount !== undefined && (
                                        <div style={{
                                            background: 'rgba(139, 92, 246, 0.06)',
                                            border: '1px solid rgba(139, 92, 246, 0.2)',
                                            borderRadius: '20px',
                                            padding: '28px',
                                            textAlign: 'center',
                                            backdropFilter: 'blur(20px)',
                                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                                        }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.transform = 'translateY(-4px)';
                                                e.currentTarget.style.background = 'rgba(139, 92, 246, 0.1)';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.transform = 'translateY(0)';
                                                e.currentTarget.style.background = 'rgba(139, 92, 246, 0.06)';
                                            }}
                                        >
                                            <div style={{ fontSize: '56px', fontWeight: 700, color: '#a78bfa', marginBottom: '8px' }}>
                                                {profileData.gamesCount}
                                            </div>
                                            <div style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '1.5px', color: '#71717a', fontWeight: 600 }}>
                                                Games Owned
                                            </div>
                                        </div>
                                    )}
                                    {profileData.badges !== undefined && (
                                        <div style={{
                                            background: 'rgba(236, 72, 153, 0.06)',
                                            border: '1px solid rgba(236, 72, 153, 0.2)',
                                            borderRadius: '20px',
                                            padding: '28px',
                                            textAlign: 'center',
                                            backdropFilter: 'blur(20px)',
                                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                                        }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.transform = 'translateY(-4px)';
                                                e.currentTarget.style.background = 'rgba(236, 72, 153, 0.1)';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.transform = 'translateY(0)';
                                                e.currentTarget.style.background = 'rgba(236, 72, 153, 0.06)';
                                            }}
                                        >
                                            <div style={{ fontSize: '56px', fontWeight: 700, color: '#f472b6', marginBottom: '8px' }}>
                                                {profileData.badges}
                                            </div>
                                            <div style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '1.5px', color: '#71717a', fontWeight: 600 }}>
                                                Total Badges
                                            </div>
                                        </div>
                                    )}
                                    {totalPlaytime > 0 && (
                                        <div style={{
                                            background: 'rgba(34, 197, 94, 0.06)',
                                            border: '1px solid rgba(34, 197, 94, 0.2)',
                                            borderRadius: '20px',
                                            padding: '28px',
                                            textAlign: 'center',
                                            backdropFilter: 'blur(20px)',
                                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                                        }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.transform = 'translateY(-4px)';
                                                e.currentTarget.style.background = 'rgba(34, 197, 94, 0.1)';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.transform = 'translateY(0)';
                                                e.currentTarget.style.background = 'rgba(34, 197, 94, 0.06)';
                                            }}
                                        >
                                            <div style={{ fontSize: '56px', fontWeight: 700, color: '#4ade80', marginBottom: '8px' }}>
                                                {Math.round(totalPlaytime / 60)}
                                            </div>
                                            <div style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '1.5px', color: '#71717a', fontWeight: 600 }}>
                                                Total Hours
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: window.innerWidth < 768 ? '1fr' : 'repeat(2, 1fr)',
                                    gap: '16px',
                                    marginBottom: '40px'
                                }}>
                                    {profileData.profile.lastlogoff && (
                                        <div style={{
                                            background: 'rgba(255, 255, 255, 0.03)',
                                            border: '1px solid rgba(255, 255, 255, 0.08)',
                                            borderRadius: '16px',
                                            padding: '20px',
                                            backdropFilter: 'blur(20px)'
                                        }}>
                                            <span style={{ color: '#71717a', fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '1px' }}>Last Online </span>
                                            <span style={{ color: 'white', fontSize: '15px', fontWeight: 600 }}>
                                                {new Date(profileData.profile.lastlogoff * 1000).toLocaleString()}
                                            </span>
                                        </div>
                                    )}
                                    {profileData.profile.timecreated && (
                                        <div style={{
                                            background: 'rgba(255, 255, 255, 0.03)',
                                            border: '1px solid rgba(255, 255, 255, 0.08)',
                                            borderRadius: '16px',
                                            padding: '20px',
                                            backdropFilter: 'blur(20px)'
                                        }}>
                                            <span style={{ color: '#71717a', fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '1px' }}>Member Since </span>
                                            <span style={{ color: 'white', fontSize: '15px', fontWeight: 600 }}>
                                                {new Date(profileData.profile.timecreated * 1000).toLocaleDateString()}
                                            </span>
                                        </div>
                                    )}
                                    {profileData.profile.loccountrycode && (
                                        <div style={{
                                            background: 'rgba(255, 255, 255, 0.03)',
                                            border: '1px solid rgba(255, 255, 255, 0.08)',
                                            borderRadius: '16px',
                                            padding: '20px',
                                            backdropFilter: 'blur(20px)'
                                        }}>
                                            <span style={{ color: '#71717a', fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '1px' }}>Country </span>
                                            <span style={{ color: 'white', fontSize: '15px', fontWeight: 600 }}>
                                                {profileData.profile.loccountrycode}
                                            </span>
                                        </div>
                                    )}
                                    <div style={{
                                        background: 'rgba(255, 255, 255, 0.03)',
                                        border: '1px solid rgba(255, 255, 255, 0.08)',
                                        borderRadius: '16px',
                                        padding: '20px',
                                        backdropFilter: 'blur(20px)'
                                    }}>
                                        <span style={{ color: '#71717a', fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '1px' }}>Profile </span>
                                        <span style={{ color: 'white', fontSize: '15px', fontWeight: 600 }}>
                                            {profileData.profile.profilestate === 1 ? 'Configured' : 'Not Setup'}
                                        </span>
                                    </div>
                                </div>

                                {profileData.recentGames && profileData.recentGames.length > 0 && (
                                    <div style={{ marginBottom: '40px' }}>
                                        <h3 style={{
                                            fontSize: '36px',
                                            fontWeight: 700,
                                            marginBottom: '28px',
                                            background: 'linear-gradient(135deg, #60a5fa, #a78bfa)',
                                            WebkitBackgroundClip: 'text',
                                            WebkitTextFillColor: 'transparent',
                                            backgroundClip: 'text',
                                            letterSpacing: '-1px'
                                        }}>
                                            Recently Played
                                        </h3>
                                        <div style={{
                                            display: 'grid',
                                            gridTemplateColumns: window.innerWidth < 640 ? '1fr' : window.innerWidth < 1024 ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
                                            gap: '20px'
                                        }}>
                                            {profileData.recentGames.map((game) => (
                                                <div key={game.appid} style={{
                                                    background: 'rgba(255, 255, 255, 0.03)',
                                                    border: '1px solid rgba(255, 255, 255, 0.08)',
                                                    borderRadius: '20px',
                                                    overflow: 'hidden',
                                                    backdropFilter: 'blur(20px)',
                                                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                                    cursor: 'pointer'
                                                }}
                                                    onMouseEnter={(e) => {
                                                        e.currentTarget.style.transform = 'translateY(-6px)';
                                                        e.currentTarget.style.boxShadow = '0 20px 50px rgba(59, 130, 246, 0.25)';
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.transform = 'translateY(0)';
                                                        e.currentTarget.style.boxShadow = 'none';
                                                    }}
                                                    onClick={() => window.open(`https://store.steampowered.com/app/${game.appid}`, '_blank')}
                                                >
                                                    <div style={{
                                                        height: '180px',
                                                        background: `url(https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/header.jpg)`,
                                                        backgroundSize: 'cover',
                                                        backgroundPosition: 'center',
                                                        position: 'relative'
                                                    }}>
                                                        <div style={{
                                                            position: 'absolute',
                                                            bottom: 0,
                                                            left: 0,
                                                            right: 0,
                                                            background: 'linear-gradient(to top, rgba(0,0,0,0.95), transparent)',
                                                            padding: '50px 20px 20px'
                                                        }}>
                                                            {game.playtime_2weeks > 0 && (
                                                                <div style={{
                                                                    display: 'inline-block',
                                                                    background: 'rgba(34, 197, 94, 0.9)',
                                                                    color: 'white',
                                                                    fontSize: '10px',
                                                                    fontWeight: 700,
                                                                    padding: '5px 12px',
                                                                    borderRadius: '8px',
                                                                    marginBottom: '8px',
                                                                    textTransform: 'uppercase',
                                                                    letterSpacing: '0.5px'
                                                                }}>
                                                                    Active
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div style={{ padding: '20px' }}>
                                                        <div style={{
                                                            color: 'white',
                                                            fontWeight: 600,
                                                            fontSize: '16px',
                                                            marginBottom: '16px',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap'
                                                        }}>
                                                            {game.name}
                                                        </div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <div>
                                                                <div style={{ fontSize: '11px', color: '#71717a', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Time</div>
                                                                <div style={{ fontSize: '20px', fontWeight: 700, color: '#60a5fa' }}>
                                                                    {formatPlaytime(game.playtime_forever)}
                                                                </div>
                                                            </div>
                                                            {game.playtime_2weeks > 0 && (
                                                                <div>
                                                                    <div style={{ fontSize: '11px', color: '#71717a', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Last 2 Weeks</div>
                                                                    <div style={{ fontSize: '20px', fontWeight: 700, color: '#4ade80' }}>
                                                                        {formatPlaytime(game.playtime_2weeks)}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {profileData.topGames && profileData.topGames.length > 0 && (
                                    <div>
                                        <h3 style={{
                                            fontSize: '36px',
                                            fontWeight: 700,
                                            marginBottom: '28px',
                                            background: 'linear-gradient(135deg, #f472b6, #a78bfa)',
                                            WebkitBackgroundClip: 'text',
                                            WebkitTextFillColor: 'transparent',
                                            backgroundClip: 'text',
                                            letterSpacing: '-1px'
                                        }}>
                                            Top 5 Most Played
                                        </h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                            {profileData.topGames.map((game, index) => (
                                                <div key={game.appid} style={{
                                                    background: 'rgba(255, 255, 255, 0.03)',
                                                    border: '1px solid rgba(255, 255, 255, 0.08)',
                                                    borderRadius: '20px',
                                                    padding: '24px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '24px',
                                                    backdropFilter: 'blur(20px)',
                                                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                                    cursor: 'pointer'
                                                }}
                                                    onMouseEnter={(e) => {
                                                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                                                        e.currentTarget.style.transform = 'translateX(8px)';
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                                                        e.currentTarget.style.transform = 'translateX(0)';
                                                    }}
                                                    onClick={() => window.open(`https://store.steampowered.com/app/${game.appid}`, '_blank')}
                                                >
                                                    <div style={{
                                                        fontSize: '28px',
                                                        fontWeight: 700,
                                                        color: index === 0 ? '#fbbf24' : index === 1 ? '#d1d5db' : index === 2 ? '#f97316' : '#71717a',
                                                        minWidth: '50px',
                                                        textAlign: 'center'
                                                    }}>
                                                        {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                                                    </div>
                                                    <div style={{
                                                        width: '90px',
                                                        height: '90px',
                                                        borderRadius: '16px',
                                                        background: `url(https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/header.jpg)`,
                                                        backgroundSize: 'cover',
                                                        backgroundPosition: 'center',
                                                        border: '2px solid rgba(255, 255, 255, 0.1)',
                                                        flexShrink: 0
                                                    }}></div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{
                                                            color: 'white',
                                                            fontWeight: 600,
                                                            fontSize: '20px',
                                                            marginBottom: '6px',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap'
                                                        }}>
                                                            {game.name}
                                                        </div>
                                                        <div style={{ fontSize: '14px', color: '#71717a', fontWeight: 400 }}>
                                                            {Math.round(game.playtime_forever / 60).toLocaleString()} hours played
                                                        </div>
                                                    </div>
                                                    <div style={{
                                                        fontSize: '28px',
                                                        fontWeight: 700,
                                                        background: 'linear-gradient(135deg, #60a5fa, #a78bfa)',
                                                        WebkitBackgroundClip: 'text',
                                                        WebkitTextFillColor: 'transparent',
                                                        backgroundClip: 'text',
                                                        textAlign: 'right',
                                                        minWidth: '100px'
                                                    }}>
                                                        {formatPlaytime(game.playtime_forever)}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                <div style={{
                    textAlign: 'center',
                    marginTop: '60px',
                    paddingTop: '40px',
                    borderTop: '1px solid rgba(255, 255, 255, 0.05)'
                }}>
                    <p style={{
                        color: '#52525b',
                        fontSize: '14px',
                        letterSpacing: '1px',
                        marginBottom: '32px',
                        fontWeight: 400
                    }}>
                        Works with Steam URLs, usernames, or Steam IDs
                    </p>

                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '16px',
                        flexWrap: 'wrap'
                    }}>
                        <span style={{
                            color: '#71717a',
                            fontSize: '13px',
                            fontWeight: 500,
                            letterSpacing: '0.5px'
                        }}>
                            Made By M1G-L 2223226
                        </span>

                        <div style={{ display: 'flex', gap: '12px' }}>
                            <a
                                href="https://github.com/M1G-L"
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: '40px',
                                    height: '40px',
                                    background: 'rgba(255, 255, 255, 0.05)',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    borderRadius: '12px',
                                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                    textDecoration: 'none'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                                    e.currentTarget.style.transform = 'translateY(0)';
                                }}
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ color: '#a1a1aa' }}>
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
                                </svg>
                            </a>

                            <a
                                href="https://steamcommunity.com/id/M1G-L/"
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: '40px',
                                    height: '40px',
                                    background: 'rgba(255, 255, 255, 0.05)',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    borderRadius: '12px',
                                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                    textDecoration: 'none'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                                    e.currentTarget.style.transform = 'translateY(0)';
                                }}
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#a1a1aa' }}>
                                    <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z" />
                                </svg>
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default App;