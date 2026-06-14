import { MedicationsService } from './medications.service';
import { CreateMedicationDto } from './dto/create-medication.dto';
import { UpdateMedicationDto } from './dto/update-medication.dto';
export declare class MedicationsController {
    private medicationsService;
    constructor(medicationsService: MedicationsService);
    createReminder(creatorId: string, dto: CreateMedicationDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        medicationName: string;
        dosage: string;
        time: string;
        isActive: boolean;
        lastTakenAt: Date | null;
        reminderType: string;
        startDate: Date;
        repeatDays: number | null;
    }>;
    getReminders(userId: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        medicationName: string;
        dosage: string;
        time: string;
        isActive: boolean;
        lastTakenAt: Date | null;
        reminderType: string;
        startDate: Date;
        repeatDays: number | null;
    }[]>;
    deleteReminder(deleterId: string, reminderId: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        medicationName: string;
        dosage: string;
        time: string;
        isActive: boolean;
        lastTakenAt: Date | null;
        reminderType: string;
        startDate: Date;
        repeatDays: number | null;
    }>;
    takeMedication(userId: string, reminderId: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        medicationName: string;
        dosage: string;
        time: string;
        isActive: boolean;
        lastTakenAt: Date | null;
        reminderType: string;
        startDate: Date;
        repeatDays: number | null;
    }>;
    updateReminder(updaterId: string, reminderId: string, dto: UpdateMedicationDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        medicationName: string;
        dosage: string;
        time: string;
        isActive: boolean;
        lastTakenAt: Date | null;
        reminderType: string;
        startDate: Date;
        repeatDays: number | null;
    }>;
}
