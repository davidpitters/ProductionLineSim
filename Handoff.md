Instructions to run
---
Prerequisite: Use .NET 8 and Node 14.21.3 or greater.
1. In one terminal, run dotnet watch run --launch-profile http from the repository root.
2. In another terminal, run npm install and npm run dev from the /frontend directory. Vite proxies /api to the API's HTTPS port
3. Navigate to the localhost port that the application is running on

Data model and assumptions
---
SQLite stores production lines, ingestion queue messages, downtime events, and duplicate-recognition records. SourceEventId identifies an event: replaying the same ID and payload returns the existing message, while reusing the ID with a different payload conflicts. An event with no end time is ongoing; a new event closes the previous ongoing event for that line. Resolving the current event sets the line to Running. The design assumes at most one current ongoing event per line.

Testing
---
For automated testing, I created an xUnit project that tests the critical functionality points of the application. This includes:
- Downtime Calculator Tests
    - Only events in the date range count
    - Events that overlap the time range only count the time within the selected date range
    - The calculated downtime report status and source event ID matches the source data
    - Created events are marked as ongoing
    - To and From filters have validation preventing impossible date ranges
- Ingestion Queue Tests
    - Identical messages are detected, return a 200 OK and are logged
    - Messages with the same source id but different payload return a 409 conflict
    - Pending Messages are processed one at a time
    - Resolving a current event sets it back to Running

Future
---
How I would expand on this project in the future would be to do the following:
- Transform generic classes into entities and DTOs with the proper naming convention *Entity.cs and *DTO.cs
- Implement the rest of the screens (Performance, Targets)
- OEE is a very important benchmark that needs to be reflected in the application.