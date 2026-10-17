import os
import json
import urllib.parse
import urllib.request
import urllib.error

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from google import genai


load_dotenv()

app = FastAPI(
    title="WeatherGPT API",
    description="AI-powered Weather Assistant",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

gemini_api_key = os.getenv("GEMINI_API_KEY")

client = (
    genai.Client(api_key=gemini_api_key)
    if gemini_api_key
    else None
)


class ChatRequest(BaseModel):
    message: str
    weather: dict | None = None


@app.get("/")
def home():
    return {
        "message": "WeatherGPT backend is running!",
        "status": "success"
    }


@app.get("/health")
def health():
    return {
        "status": "healthy"
    }


@app.post("/api/chat")
def chat(request: ChatRequest):
    if client is None:
        raise HTTPException(
            status_code=500,
            detail="GEMINI_API_KEY missing. Check backend .env file."
        )

    user_message = request.message.strip()

    if not user_message:
        raise HTTPException(
            status_code=400,
            detail="Please enter a message."
        )

    weather_context = (
        json.dumps(request.weather, ensure_ascii=False)
        if request.weather
        else "No weather data was provided."
    )

    prompt = f"""
You are WeatherGPT, a helpful and friendly weather assistant.

Instructions:
- Answer the user's question clearly.
- Use the supplied weather data when relevant.
- Never invent current weather conditions or forecasts.
- If weather data is missing, say so honestly.
- For unrelated questions, politely explain that you specialize in weather.

Weather information:
{weather_context}

User question:
{user_message}
"""

    try:
        response = client.models.generate_content(
            model="gemini-flash-lite-latest",
            contents=prompt
        )

        reply = response.text

        if not reply:
            raise ValueError("Gemini returned an empty response.")

        return {
            "reply": reply
        }

    except Exception as exc:
        print("Gemini API error:", str(exc))

        raise HTTPException(
            status_code=502,
            detail="Gemini API request failed. Check the backend terminal."
        ) from exc


@app.get("/api/weather")
def get_weather(city: str):
    weather_api_key = os.getenv("OPENWEATHER_API_KEY")

    if not weather_api_key:
        raise HTTPException(
            status_code=500,
            detail="OPENWEATHER_API_KEY missing. Check backend .env file."
        )

    city = city.strip()

    if not city:
        raise HTTPException(
            status_code=400,
            detail="Please provide a city name."
        )

    encoded_city = urllib.parse.quote(city)

    url = (
        "https://api.openweathermap.org/data/2.5/weather"
        f"?q={encoded_city}"
        f"&appid={urllib.parse.quote(weather_api_key)}"
        "&units=metric"
    )

    try:
        weather_request = urllib.request.Request(
            url,
            headers={"User-Agent": "WeatherGPT/1.0"}
        )

        with urllib.request.urlopen(
            weather_request,
            timeout=20
        ) as response:
            data = json.loads(response.read().decode("utf-8"))

        weather_items = data.get("weather", [])
        main_data = data.get("main", {})
        wind_data = data.get("wind", {})
        sys_data = data.get("sys", {})

        if not weather_items or not main_data:
            raise HTTPException(
                status_code=502,
                detail="Weather provider returned incomplete weather data."
            )

        geo_url = (
            "https://geocoding-api.open-meteo.com/v1/search"
            f"?name={urllib.parse.quote(city)}"
            "&count=1&language=en&format=json"
        )

        geo_request = urllib.request.Request(
            geo_url,
            headers={"User-Agent": "WeatherGPT/1.0"}
        )

        with urllib.request.urlopen(
            geo_request,
            timeout=20
        ) as geo_response:
            geo_data = json.loads(
                geo_response.read().decode("utf-8")
            )

        locations = geo_data.get("results", [])

        if not locations:
            raise HTTPException(
                status_code=404,
                detail="Could not find city coordinates for forecast."
            )

        latitude = locations[0]["latitude"]
        longitude = locations[0]["longitude"]

        forecast_url = (
            "https://api.open-meteo.com/v1/forecast"
            f"?latitude={latitude}"
            f"&longitude={longitude}"
            "&daily=weather_code,temperature_2m_max,"
            "temperature_2m_min,precipitation_probability_max"
            "&forecast_days=7"
            "&timezone=auto"
        )

        forecast_request = urllib.request.Request(
            forecast_url,
            headers={"User-Agent": "WeatherGPT/1.0"}
        )

        with urllib.request.urlopen(
            forecast_request,
            timeout=20
        ) as forecast_response:
            forecast_data = json.loads(
                forecast_response.read().decode("utf-8")
            )

        daily_data = forecast_data.get("daily", {})

        if not daily_data.get("time"):
            raise HTTPException(
                status_code=502,
                detail="Weather provider returned no forecast data."
            )

        return {
            "status": "success",
            "city": data.get("name", city),
            "country": sys_data.get("country"),
            "temperature": main_data.get("temp"),
            "feels_like": main_data.get("feels_like"),
            "temp_min": main_data.get("temp_min"),
            "temp_max": main_data.get("temp_max"),
            "humidity": main_data.get("humidity"),
            "pressure": main_data.get("pressure"),
            "wind_speed": wind_data.get("speed"),
            "condition": weather_items[0].get("main"),
            "description": weather_items[0].get("description"),
            "icon": weather_items[0].get("icon"),
            "daily": {
                "time": daily_data.get("time", []),
                "weather_code": daily_data.get("weather_code", []),
                "temperature_2m_max": daily_data.get(
                    "temperature_2m_max", []
                ),
                "temperature_2m_min": daily_data.get(
                    "temperature_2m_min", []
                ),
                "precipitation_probability_max": daily_data.get(
                    "precipitation_probability_max", []
                )
            }
        }

    except HTTPException:
        raise

    except urllib.error.HTTPError as exc:
        try:
            error_data = json.loads(exc.read().decode("utf-8"))
            provider_message = error_data.get(
                "message",
                "Weather provider request failed."
            )
        except (ValueError, AttributeError):
            provider_message = "Weather provider request failed."

        print(
    f"Weather API error: HTTP {exc.code} - "
    f"URL: {exc.url} - Message: {provider_message}"
)

        if exc.code == 401:
            raise HTTPException(
                status_code=502,
                detail=(
                    "OpenWeather rejected the API key. "
                    "Verify the key and check whether it has been activated."
                )
            ) from exc

        if exc.code == 404:
            raise HTTPException(
                status_code=404,
                detail="City not found. Please check the city name."
            ) from exc

        if exc.code == 429:
            raise HTTPException(
                status_code=502,
                detail="Weather API request limit reached. Try again later."
            ) from exc

        raise HTTPException(
            status_code=502,
            detail=f"Weather provider error (HTTP {exc.code})."
        ) from exc

    except urllib.error.URLError as exc:
        print("Weather API connection error:", str(exc.reason))

        raise HTTPException(
            status_code=503,
            detail=(
                "Could not connect to the weather provider. "
                "Check your internet connection."
            )
        ) from exc

    except (KeyError, IndexError, ValueError) as exc:
        print("Weather response parsing error:", str(exc))

        raise HTTPException(
            status_code=502,
            detail="Could not process the weather provider response."
        ) from exc