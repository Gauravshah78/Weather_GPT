import { useEffect, useState } from "react";
import "./App.css";

const API_URL = "https://weather-gpt-4.onrender.com";

const weatherTypes = {
  0: "Clear Sky",
  1: "Mainly Clear",
  2: "Partly Cloudy",
  3: "Overcast",
  45: "Foggy",
  48: "Foggy",
  51: "Light Drizzle",
  53: "Drizzle",
  55: "Heavy Drizzle",
  61: "Light Rain",
  63: "Rain",
  65: "Heavy Rain",
  71: "Light Snow",
  73: "Snow",
  75: "Heavy Snow",
  80: "Rain Showers",
  81: "Rain Showers",
  82: "Heavy Rain Showers",
  95: "Thunderstorm",
  96: "Thunderstorm with Hail",
  99: "Severe Thunderstorm",
};

function getWeatherIcon(code) {
  if (code === 0) return "☀️";
  if ([1, 2].includes(code)) return "🌤️";
  if (code === 3) return "☁️";
  if ([45, 48].includes(code)) return "🌫️";
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return "🌧️";
  if ([71, 73, 75].includes(code)) return "❄️";
  if ([95, 96, 99].includes(code)) return "⛈️";
  return "🌦️";
}

function App() {
  const [city, setCity] = useState("Dehradun");
  const [search, setSearch] = useState("");
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceError, setVoiceError] = useState("");

  async function fetchWeather(cityName) {
    const trimmedCity = cityName.trim();


    if (!trimmedCity) {
      setError("Please enter a city name.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `${API_URL}/api/weather?city=${encodeURIComponent(trimmedCity)}`
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.status === "error") {
        throw new Error(
          data.detail || data.message || "Unable to fetch weather."
        );
      }

      if (!data.city || !data.daily || data.temperature === undefined) {
        throw new Error("The weather API returned incomplete data.");
      }

      setWeather({
        current: {
          temperature_2m: data.temperature,
          apparent_temperature: data.feels_like,
          relative_humidity_2m: data.humidity,
          wind_speed_10m: Number((data.wind_speed * 3.6).toFixed(1)),
          weather_code: data.daily.weather_code?.[0] ?? 0,
          is_day: data.icon?.endsWith("d") ? 1 : 0,
          precipitation: 0,
          time: new Date().toISOString(),
        },
        daily: {
          time: data.daily.time ?? [],
          weather_code: data.daily.weather_code ?? [],
          temperature_2m_max: data.daily.temperature_2m_max ?? [],
          temperature_2m_min: data.daily.temperature_2m_min ?? [],
          precipitation_probability_max:
            data.daily.precipitation_probability_max ?? [],
        },
        place: {
          name: data.city,
          country: data.country,
        },
      });

      setCity(data.city);
      setSearch("");
      setUpdatedAt(
        new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    } catch (err) {
      console.error("Weather fetch error:", err);
      setError(err.message || "Unable to fetch weather.");
    } finally {
      setLoading(false);
    }


  }

  useEffect(() => {
    fetchWeather("Dehradun");


    return () => {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };


  }, []);

  function handleSearch(event) {
    event.preventDefault();
    fetchWeather(search);
  }

  function startVoiceInput() {
    setVoiceError("");


    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setVoiceError(
        "Voice recognition is not supported in this browser. Please use Google Chrome."
      );
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript.trim();

      if (transcript) {
        setChatInput(transcript);
        sendChatMessage(null, transcript);
      }
    };

    recognition.onerror = (event) => {
      setVoiceError(
        event.error === "not-allowed"
          ? "Microphone permission denied. Please allow microphone access."
          : `Voice error: ${event.error}`
      );
    };

    recognition.onend = () => setIsListening(false);

    try {
      recognition.start();
    } catch {
      setIsListening(false);
      setVoiceError("Microphone could not start. Please try again.");
    }


  }

  function stopSpeaking() {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }


    setIsSpeaking(false);


  }

  function speakReply(text) {
    if (!("speechSynthesis" in window)) {
      setVoiceError("Voice playback is not supported in this browser.");
      return;
    }


    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-IN";
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);


  }

  async function sendChatMessage(event, overrideMessage = "") {
    event?.preventDefault();


    const message = (overrideMessage || chatInput).trim();

    if (!message || chatLoading) return;

    setChatMessages((previous) => [
      ...previous,
      { role: "user", text: message },
    ]);

    setChatInput("");
    setChatLoading(true);
    setVoiceError("");

    try {
      const response = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message,
          weather: weather
            ? {
              city: weather.place?.name,
              temperature: weather.current?.temperature_2m,
              feels_like: weather.current?.apparent_temperature,
              humidity: weather.current?.relative_humidity_2m,
              wind_speed: weather.current?.wind_speed_10m,
              condition:
                weatherTypes[weather.current?.weather_code] || "Unknown",
              forecast: weather.daily
                ? weather.daily.time.slice(0, 3).map((date, index) => ({
                  date,
                  max_temperature:
                    weather.daily.temperature_2m_max[index],
                  min_temperature:
                    weather.daily.temperature_2m_min[index],
                  rain_probability:
                    weather.daily.precipitation_probability_max[index] ??
                    null,
                }))
                : [],
            }
            : null,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.detail || data.message || "Unable to get an AI response."
        );
      }

      if (!data.reply) {
        throw new Error("The AI service returned an empty response.");
      }

      setChatMessages((previous) => [
        ...previous,
        { role: "assistant", text: data.reply },
      ]);

      speakReply(data.reply);
    } catch (err) {
      setChatMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          text: `Sorry, ${err.message}. Please try again.`,
        },
      ]);
    } finally {
      setChatLoading(false);
    }


  }

  const current = weather?.current;
  const daily = weather?.daily;
  const place = weather?.place;

  return (<div className="app-shell"> <aside className="sidebar"> <div className="brand"> <div className="brand-icon">☁</div> <div> <h2>WeatherGPT</h2> <span>Weather Intelligence</span> </div> </div>


    <div className="sidebar-label">WORKSPACE</div>

    <button className="nav-item active">
      <span>◫</span> Overview
    </button>

    <button
      className="nav-item"
      onClick={() =>
        document
          .getElementById("forecast")
          ?.scrollIntoView({ behavior: "smooth" })
      }
    >
      <span>▥</span> Forecast
    </button>

    <button
      className="nav-item"
      onClick={() =>
        document
          .getElementById("assistant")
          ?.scrollIntoView({ behavior: "smooth" })
      }
    >
      <span>✧</span> AI Assistant
    </button>

    <div className="sidebar-bottom">
      <div className="status-dot"></div>
      <div>
        <strong>Weather Services</strong>
        <span>Connected to API</span>
      </div>
    </div>
  </aside>

    <main className="main-content">
      <header className="topbar">
        <div>
          <div className="eyebrow">WEATHER INTELLIGENCE PLATFORM</div>
          <h1>
            Good day, Explorer <span>✦</span>
          </h1>
          <p>Understand the weather. Make better decisions.</p>
        </div>

        <form className="search-box" onSubmit={handleSearch}>
          <span>⌕</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search any city..."
            aria-label="Search city"
          />
          <button type="submit" disabled={loading}>
            {loading ? "..." : "Search"}
          </button>
        </form>
      </header>

      {error && (
        <div className="error-banner" role="alert">
          {error}
          <button onClick={() => setError("")}>Dismiss</button>
        </div>
      )}

      {loading && !weather ? (
        <div className="loading-state">Loading weather intelligence...</div>
      ) : current && daily && place ? (
        <>
          <section className="weather-hero">
            <div className="hero-copy">
              <div className="location-tag">
                <span>⌖</span> {place.name}
                {place.country ? `, ${place.country}` : ""}
              </div>

              <div className="hero-date">
                {new Date().toLocaleDateString("en-IN", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </div>

              <div className="temperature-row">
                <h2>{Math.round(current.temperature_2m)}°</h2>
                <div className="weather-symbol">
                  {getWeatherIcon(current.weather_code)}
                </div>
              </div>

              <h3>
                {weatherTypes[current.weather_code] || "Current Conditions"}
              </h3>

              <p className="hero-description">
                Feels like {Math.round(current.apparent_temperature)}°
                <span> · </span>
                {current.is_day ? "Daytime" : "Nighttime"}
              </p>

              <div className="hero-meta">
                <span>
                  ◷ Local time:{" "}
                  {new Date().toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span>↻ Updated at {updatedAt || "just now"}</span>
              </div>
            </div>

            <div className="hero-visual" aria-hidden="true">
              <div className="sun-orb"></div>
              <div className="cloud cloud-back"></div>
              <div className="cloud cloud-front"></div>
              <div className="visual-caption">LIVE CONDITIONS</div>
            </div>
          </section>

          <section className="section-block">
            <div className="section-heading">
              <div>
                <div className="eyebrow">AT A GLANCE</div>
                <h2>Weather Overview</h2>
              </div>
              <span className="live-badge">
                <i></i> Live data
              </span>
            </div>

            <div className="metrics-grid">
              <MetricCard
                icon="◉"
                label="Feels Like"
                value={`${Math.round(current.apparent_temperature)}°C`}
                note="Perceived temperature"
              />
              <MetricCard
                icon="◌"
                label="Humidity"
                value={`${current.relative_humidity_2m}%`}
                note="Relative humidity"
              />
              <MetricCard
                icon="≋"
                label="Wind Speed"
                value={`${current.wind_speed_10m} km/h`}
                note="At current location"
              />
              <MetricCard
                icon="⌁"
                label="Precipitation"
                value={`${current.precipitation} mm`}
                note="Current reported amount"
              />
            </div>
          </section>

          <section className="section-block" id="forecast">
            <div className="section-heading">
              <div>
                <div className="eyebrow">PLAN AHEAD</div>
                <h2>7-Day Forecast</h2>
              </div>
              <span className="muted-text">Local dates</span>
            </div>

            <div className="forecast-grid">
              {daily.time.map((date, index) => (
                <div
                  className={`forecast-card ${index === 0 ? "today" : ""}`}
                  key={date}
                >
                  <span className="forecast-day">
                    {index === 0
                      ? "Today"
                      : new Date(`${date}T12:00:00`).toLocaleDateString(
                        "en-US",
                        { weekday: "short" }
                      )}
                  </span>

                  <span className="forecast-icon">
                    {getWeatherIcon(daily.weather_code[index])}
                  </span>

                  <strong>
                    {Math.round(daily.temperature_2m_max[index])}°
                  </strong>

                  <span className="low-temp">
                    {Math.round(daily.temperature_2m_min[index])}°
                  </span>

                  <div className="rain-chance">
                    <span>☂</span>{" "}
                    {daily.precipitation_probability_max[index] ?? "—"}%
                  </div>
                </div>
              ))}
            </div>

            <p className="data-note">
              Forecasts are estimates and may change. Rain probability is
              shown when provided by the weather service.
            </p>
          </section>

          <section className="assistant-panel" id="assistant">
            <div className="assistant-icon">✧</div>

            <div className="assistant-copy">
              <span className="eyebrow">YOUR WEATHER COMPANION</span>
              <h2>Ask WeatherGPT</h2>
              <p>
                Ask questions about your current weather and forecast.
                WeatherGPT uses Gemini AI to generate answers.
              </p>
            </div>

            <div className="chat-box">
              <div className="chat-messages">
                {chatMessages.length === 0 && (
                  <div className="chat-welcome">
                    <strong>Hi! I'm WeatherGPT 👋</strong>
                    <p>Try asking: "Should I carry an umbrella today?"</p>
                  </div>
                )}

                {chatMessages.map((item, index) => (
                  <div
                    className={`chat-message ${item.role}`}
                    key={`${index}-${item.role}`}
                  >
                    <strong>
                      {item.role === "user" ? "You" : "WeatherGPT"}
                    </strong>
                    <p>{item.text}</p>
                  </div>
                ))}

                {chatLoading && (
                  <div className="chat-message assistant">
                    <strong>WeatherGPT</strong>
                    <p>Thinking...</p>
                  </div>
                )}
              </div>

              {voiceError && (
                <p className="voice-error" role="alert">
                  {voiceError}
                </p>
              )}

              <form className="chat-form" onSubmit={sendChatMessage}>
                <input
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  placeholder="Ask about your weather..."
                  aria-label="Ask WeatherGPT"
                  disabled={chatLoading}
                />

                <button
                  type="button"
                  onClick={startVoiceInput}
                  disabled={chatLoading || isListening}
                  title="Speak to WeatherGPT"
                  aria-label="Start voice input"
                >
                  {isListening ? "🎙️ Listening..." : "🎤 Mic"}
                </button>

                <button
                  type="submit"
                  disabled={chatLoading || !chatInput.trim()}
                >
                  {chatLoading ? "..." : "Send ↑"}
                </button>
              </form>

              {isSpeaking && (
                <button
                  type="button"
                  className="stop-voice-button"
                  onClick={stopSpeaking}
                >
                  ⏹ Stop Voice
                </button>
              )}
            </div>
          </section>

          <footer className="footer">
            <span>WeatherGPT © 2026</span>
            <span>Weather data: Open-Meteo</span>
            <span>Built for better weather decisions.</span>
          </footer>
        </>
      ) : (
        <div className="loading-state">
          Weather data is not available. Search for a city to try again.
        </div>
      )}
    </main>
  </div>


  );
}

function MetricCard({ icon, label, value, note }) {
  return (<article className="metric-card"> <div className="metric-top"> <span className="metric-icon">{icon}</span> <span className="metric-label">{label}</span> </div> <strong className="metric-value">{value}</strong> <span className="metric-note">{note}</span> </article>
  );
}

export default App;
