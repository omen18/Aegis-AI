"""Seed the database with demo users, resources, and incidents.

Usage:  python -m app.db.seed
Creates ORM tables if missing (dev convenience) and inserts a demo dataset.
For the full PostGIS schema use app/db/schema.sql via psql instead.
"""
import asyncio
import random

from sqlalchemy import select

from app.core.database import Base, SessionLocal, engine
from app.core.security import hash_password
from app.models import Incident, Resource, User

DEMO_USERS = [
    ("citizen@nexus.ai", "Priya Citizen", "citizen"),
    ("volunteer@nexus.ai", "Arjun Volunteer", "volunteer"),
    ("ngo@nexus.ai", "ReliefOrg Coordinator", "ngo"),
    ("gov@nexus.ai", "District Magistrate", "government"),
    ("admin@nexus.ai", "System Admin", "admin"),
]
CENTER = (19.0760, 72.8777)  # Mumbai-ish anchor
TYPES = ["collapse", "flood", "fire", "medical", "gas", "trapped", "power"]


async def main() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with SessionLocal() as db:
        if await db.scalar(select(User).limit(1)):
            print("Seed data already present — skipping.")
            return

        for email, name, role in DEMO_USERS:
            db.add(User(email=email, full_name=name, role=role,
                        hashed_password=hash_password("password123")))

        for i in range(6):
            db.add(Resource(
                kind="ambulance", callsign=f"AMB-{i+1:02d}", status="available",
                lat=CENTER[0] + random.uniform(-0.05, 0.05),
                lon=CENTER[1] + random.uniform(-0.05, 0.05),
                capacity=2,
            ))
        for i in range(3):
            db.add(Resource(
                kind="rescue_team", callsign=f"RES-{chr(65+i)}", status="available",
                lat=CENTER[0] + random.uniform(-0.05, 0.05),
                lon=CENTER[1] + random.uniform(-0.05, 0.05),
                capacity=6,
            ))

        for i in range(8):
            db.add(Incident(
                code=f"INC-{20000+i}", type=random.choice(TYPES),
                severity=random.randint(0, 3), status="reported",
                zone=random.choice(["Old Harbour", "Civic Core", "Marsh End", "Dockside"]),
                lat=CENTER[0] + random.uniform(-0.06, 0.06),
                lon=CENTER[1] + random.uniform(-0.06, 0.06),
                people_affected=random.randint(2, 120),
            ))

        await db.commit()
        print(f"Seeded {len(DEMO_USERS)} users, 9 resources, 8 incidents.")
        print("Login with any demo email + password: password123")


if __name__ == "__main__":
    asyncio.run(main())
