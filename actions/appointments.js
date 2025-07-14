"use server"

import { db } from "@/lib/prisma"
import { auth } from "@clerk/nextjs/server";
import { addDays, addMinutes, endOfDay, format, isBefore } from "date-fns";
import { deductCreditsForAppointment } from "./credits";
import { revalidatePath } from "next/cache";
import { Auth } from "@vonage/auth";
import { Vonage } from "@vonage/server-sdk";

const credentials = new Auth({
    applicationId: process.env.NEXT_PUBLIC_VONAGE_APPLICATION_ID,
    privateKey: process.env.VONAGE_PRIVATE_KEY
})

const vonage = new Vonage(credentials, {});

export async function getDoctorById(doctorId) {
    try {
        const doctor = await db.user.findUnique({
            where: {
                id: doctorId,
                role: "DOCTOR",
                verificationStatus: "VERIFIED"
            }
        })

        if (!doctor) {
            throw new Error("Doctor not found")
        }
        return { doctor };
    } catch (error) {
        throw new Error("Failed to fetch doctor details")
    }
}

export async function getAvailableTimeSlots(doctorId) {
    try {
        const doctor = await db.user.findUnique({
            where: {
                id: doctorId,
                role: "DOCTOR",
                verificationStatus: "VERIFIED"
            }
        })

        if (!doctor) {
            throw new Error("Doctor not found")
        }

        const availability = await db.availability.findFirst({
            where: {
                doctorId: doctor.id,
                status: "AVAILABLE"
            }

        })

        if (!availability) {
            throw new Error("No availablity set by doctor")
        }
        const now = new Date();
        const days = [now, addDays(now, 1), addDays(now, 2), addDays(now, 3)];

        const lastDay = endOfDay(days[3]);

        const existingAppointments = await db.appointment.findMany({
            where: {
                doctorId: doctor.id,
                status: "SCHEDULED",
                startTime: {
                    lte: lastDay
                }
            }
        })

        const availablitySlotsByDay = {}

        for (const day of days) {

            const dayString = format(day, "yyyy-MM-dd");
            availablitySlotsByDay[dayString] = []


            const availabilityStart = new Date(availability.startTime);
            const availabilityEnd = new Date(availability.endTime);

            availabilityStart.setFullYear(day.getFullYear(), day.getMonth(), day.getDate())
            availabilityEnd.setFullYear(day.getFullYear(), day.getMonth(), day.getDate())


            let current = new Date(availabilityStart);
            const end = new Date(availabilityEnd);

            while (
                isBefore(addMinutes(current, 30), end) ||
                +addMinutes(current, 30) === +end
            ) {
                const next = addMinutes(current, 30)
                if (isBefore(current, now)) {
                    current = next;
                    continue;
                }

                const overlaps = existingAppointments.some((appointment) => {
                    const aStart = new Date(appointment.startTime);
                    const aEnd = new Date(appointment.endTime);


                    return (
                        (current >= aStart && current < aEnd) ||
                        (next > aStart && next < aEnd) ||
                        (current <= aStart && next >= aEnd)
                    )
                });

                if (!overlaps) {
                    availablitySlotsByDay[dayString].push({
                        startTime: current.toISOString(),
                        endTime: next.toISOString(),
                        formatted: `${format(current, "h:mm a")} - ${format(
                            next,
                            "h:mm a"
                        )}`,
                        day: format(current, "EEEE, MMMM d"),
                    });
                }

                current = next;

            }

        }
        // Convert to array of slots grouped by day for easier consumption by the UI
        const result = Object.entries(availablitySlotsByDay).map(([date, slots]) => ({
            date,
            displayDate:
                slots.length > 0
                    ? slots[0].day
                    : format(new Date(date), "EEEE, MMMM d"),
            slots,
        }));

        return { days: result }
    } catch (error) {
        throw new Error("Failed to fetch available time slots" + error.message)
    }
}


export async function bookAppointment(formData) {
    const { userId } = await auth();

    if (!userId) {
        throw new Error("Unauthorized");
    }

    try {
        const patient = await db.user.findUnique({
            where: {
                clerkUserId: userId,
                role: "PATIENT"
            }
        })

        if (!patient) {
            throw new Error("Patient not found")
        }

        // Parse form data
        const doctorId = formData.get("doctorId");
        const startTime = new Date(formData.get("startTime"));
        const endTime = new Date(formData.get("endTime"));
        const patientDescription = formData.get("description") || null;

        if (!doctorId || !startTime || !endTime) {
            throw new Error("Missing required fields")
        }

        const doctor = await db.user.findUnique({
            where: {
                id: doctorId,
                role: "DOCTOR",
                verificationStatus: "VERIFIED"
            }
        })

        if (!doctor) {
            throw new Error("Doctor not found or not Verified")
        }


        if (patient.credits < 2) {
            throw new Error("Insufficient credits to book an appointment")
        }

        const overLappingAppointment = await db.appointment.findFirst({
            where: {
                doctorId: doctorId,
                status: "SCHEDULED",
                OR: [
                    {
                        // New appointment starts during an existing appointment
                        startTime: {
                            lte: startTime,
                        },
                        endTime: {
                            gt: startTime,
                        },
                    },

                    {
                        // New appointment ends during an existing appointment
                        startTime: {
                            lt: endTime,
                        },
                        endTime: {
                            gte: endTime,
                        },
                    },

                    {
                        // New appointment completely overlaps an existing appointment
                        startTime: {
                            gte: startTime,
                        },
                        endTime: {
                            lte: endTime,
                        },
                    },
                ]
            }
        })

        if (overLappingAppointment) {
            throw new Error("This time slot is  already booked")
        }

        const sessionId = await createVideoSession();


        // Deduct credits from patient and add to doctor
        const { success, error } = await deductCreditsForAppointment(
            patient.id,
            doctor.id
        );

        if (!success) {
            throw new Error(error || "Failed to deduct credits")
        }

        // Create the appointment with the video session ID
        const appointment = await db.appointment.create({
            data: {
                patientId: patient.id,
                doctorId: doctor.id,
                startTime,
                endTime,
                patientDescription,
                status: "SCHEDULED",
                videoSessionId: sessionId, // Store the Vonage session ID
            },
        });


        revalidatePath("/appointments")
        return { success: true, appointment: appointment }

    } catch (error) {
        throw new Error("Failed to book appointment" + error.message)
    }
}

export async function createVideoSession() {
    try {
        const session = await vonage.video.createSession({
            mediaMode: "routed"
        })
        return session.sessionId;
    } catch (error) {
        throw new Error("Failed to create video session" + error.message)

    }
}

export async function generateVideoToken(formData) {
    const { userId } = await auth();

    if (!userId) {
        throw new Error("Unauthorized");
    }

    try {
        const user = await db.user.findUnique({
            where: {
                clerkUserId: userId
            }
        })

        if (!user) {
            throw new Error("User not found");

        }

        const appointmentId = formData.get("appointmentId");
        const appointment = await db.appointment.findUnique({
            where: {
                id: appointmentId
            }
        })

        if (!appointment) {
            throw new Error("Appointment not found")
        }

        if (appointment.doctorId !== user.id && appointment.patientId !== user.id) {
            throw new Error("You are not authorized to join this call")
        }

        if (appointment.status !== "SCHEDULED") {
            throw new Error("This appointment is not currently scheduled")
        }

        const now = new Date()
        const appointmentTime = new Date(appointment.startTime)

        const timeDifference = (appointmentTime - now) / (1000 * 60)

        if (timeDifference > 30) {
            throw new Error("This call will be available 30 minutes before the sheduled time")
        }


        const appointmentEndTime = new Date(appointment.endTime)
        const expirationTime = Math.floor(appointmentEndTime.getTime() / 1000) + 60 * 60//1 Hour after end time

        // Use user's name and role as connection data
        const connectionData = JSON.stringify({
            name: user.name,
            role: user.role,
            userId: user.id,
        });

        const token = vonage.video.generateClientToken(appointment.videoSessionId, {
            role: "publisher",//both patient and doctor can publish stream
            expireTime: expirationTime,
            data: connectionData,
        })

        await db.appointment.update({
            where: {
                id: appointmentId
            },
            data: {
                videoSessionToken: token,
            }
        })

        return {
            success: true,
            videoSessionId: appointment.videoSessionId,
            token: token
        }

    } catch (error) {
        throw new Error("Failed to generate video token" + error.message)
    }
}